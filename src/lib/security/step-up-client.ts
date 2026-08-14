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
  /** Exact operation payload that will be submitted (bound into the signature).
   *  When the server issues the challenge, the payload hash is supplied by the
   *  server and the client only signs it; this field is still required for the
   *  client-side hash computation path used by tests/legacy callers. */
  readonly payload: unknown;
};

type ChallengeRow = {
  challenge_id?: string;
  nonce?: string;
  expires_at?: string;
  device_id?: string;
  payload_hash?: string;
};

export type StepUpBeginChallenge = (input: {
  deviceId: string;
  requestId: string;
}) => Promise<{ data: ChallengeRow | null; error: { message?: string } | null }>;

async function defaultVerifyAssertion(input: {
  challengeId: string;
  signature: string;
}): Promise<{ ok: boolean; proofToken?: string }> {
  const { verifyStepUpAssertionFn } = await import("./step-up-verify.functions");
  const result = await verifyStepUpAssertionFn({ data: input });
  return result.ok ? { ok: true, proofToken: result.proofToken } : { ok: false };
}

function first<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return (data as T) ?? null;
}

/**
 * Returns a proof token, or a terminal non-proof outcome.
 * Callers MUST NOT invoke the sensitive RPC unless `status === "proof"`.
 */
export async function performStepUp(
  input: StepUpRequest,
  deps: {
    biometricsAvailable?: () => boolean;
    ensureKey?: typeof ensureDeviceKey;
    sign?: typeof signStepUpChallenge;
    /** Server-side challenge built from the trusted draft. Replaces the old
     *  client-side issue_step_up_challenge RPC. */
    beginChallenge?: StepUpBeginChallenge;
    /** Server-side ECDSA verification + single-use proof minting. */
    verifyAssertion?: (input: {
      challengeId: string;
      signature: string;
    }) => Promise<{ ok: boolean; proofToken?: string }>;
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

  const beginChallengeFn = deps.beginChallenge ?? defaultBeginChallenge;
  const issued = await beginChallengeFn({ deviceId, requestId: input.requestId });
  if (issued.error) {
    return { status: "failed", messageAr: STEP_UP_MESSAGES_AR.failed };
  }
  const challenge = first<ChallengeRow>(issued.data);
  if (!challenge?.challenge_id || !challenge.nonce || !challenge.expires_at || !challenge.payload_hash) {
    return { status: "failed", messageAr: STEP_UP_MESSAGES_AR.failed };
  }

  const message = buildStepUpSigningMessage({
    challengeId: challenge.challenge_id,
    nonce: challenge.nonce,
    userId: input.userId,
    deviceId,
    actionCode: descriptor.actionCode,
    requestId: input.requestId,
    payloadHash: challenge.payload_hash,
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

  const verify = deps.verifyAssertion ?? defaultVerifyAssertion;
  let verified: { ok: boolean; proofToken?: string };
  try {
    verified = await verify({
      challengeId: challenge.challenge_id,
      signature,
    });
  } catch {
    return { status: "failed", messageAr: STEP_UP_MESSAGES_AR.failed };
  }
  if (!verified.ok || !verified.proofToken) {
    return { status: "failed", messageAr: STEP_UP_MESSAGES_AR.failed };
  }
  return { status: "proof", proofToken: verified.proofToken };
}

async function defaultBeginChallenge(input: {
  deviceId: string;
  requestId: string;
}): Promise<{ data: ChallengeRow | null; error: { message?: string } | null }> {
  const { beginStepUpChallengeFn } = await import("./device-trust.functions");
  try {
    const data = await beginStepUpChallengeFn({ data: input });
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}
