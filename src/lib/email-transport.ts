// Resend transport selection (Phase 9B + LOVABLE-EXIT-01).
// Pure module: no secrets, no I/O.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
// Direct Resend API, used when the portal runs outside Lovable (LOVABLE-EXIT-01):
// only RESEND_API_KEY is configured and there is no LOVABLE_API_KEY.
const RESEND_DIRECT_URL = "https://api.resend.com";

export function resolveEmailTransport(env: {
  LOVABLE_API_KEY?: string;
  RESEND_API_KEY?: string;
}): { url: string; headers: Record<string, string> } | null {
  const lovableKey = env.LOVABLE_API_KEY?.trim();
  const resendKey = env.RESEND_API_KEY?.trim();
  if (!resendKey) return null;
  if (lovableKey) {
    return {
      url: `${GATEWAY_URL}/emails`,
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": resendKey },
    };
  }
  return { url: `${RESEND_DIRECT_URL}/emails`, headers: { Authorization: `Bearer ${resendKey}` } };
}
