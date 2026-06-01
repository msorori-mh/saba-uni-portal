// Phase 9B: Email service via Resend (Lovable Connector Gateway)
// - Never throws to caller. Always returns { ok, error? }.
// - Always logs attempts to email_logs.
// - Business transactions succeed first; email is secondary.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderTemplate, type EmailTemplateKey } from "./email-templates";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

const inputSchema = z.object({
  templateKey: z.enum([
    "request_approved",
    "request_rejected",
    "receipt_approved",
    "receipt_rejected",
    "grade_approved",
    "document_issued",
    "password_reset",
    "welcome",
  ]),
  recipientEmail: z.string().email().max(254).optional().nullable(),
  recipientName: z.string().max(200).optional().nullable(),
  variables: z.record(z.string(), z.unknown()).default({}),
  relatedEntityType: z.string().max(64).optional().nullable(),
  relatedEntityId: z.string().uuid().optional().nullable(),
});

async function fetchSiteContext(
  supabase: { from: (t: string) => { select: (c: string) => { in: (col: string, vals: string[]) => Promise<{ data: { setting_key: string; setting_value: string }[] | null }> } } },
): Promise<{ university_name: string; college_name: string; from_email: string; from_name: string }> {
  const { data } = await supabase
    .from("site_settings")
    .select("setting_key, setting_value")
    .in("setting_key", ["university_name", "college_name", "email_from_address", "email_from_name"]);
  const map = new Map<string, string>();
  (data ?? []).forEach((r) => map.set(r.setting_key, r.setting_value));
  return {
    university_name: map.get("university_name") || "جامعة سبأ",
    college_name: map.get("college_name") || "كلية تكنولوجيا المعلومات وعلوم الحاسوب",
    from_email: map.get("email_from_address") || "onboarding@resend.dev",
    from_name: map.get("email_from_name") || "بوابة كلية تكنولوجيا المعلومات",
  };
}

export const sendNotificationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const triggeredBy = context.userId as string | undefined;

    // 1) Early skip: no recipient
    if (!data.recipientEmail) {
      await supabase.from("email_logs").insert({
        template_name: data.templateKey,
        recipient_email: "(missing)",
        subject: "(skipped)",
        status: "skipped",
        error_message: "Recipient email not available",
        related_entity_type: data.relatedEntityType ?? null,
        related_entity_id: data.relatedEntityId ?? null,
        triggered_by: triggeredBy ?? null,
        metadata: { variables: data.variables },
      });
      return { ok: false, skipped: true as const, error: "no_recipient" };
    }

    // 2) Render template
    const site = await fetchSiteContext(supabase);
    const rendered = renderTemplate(data.templateKey as EmailTemplateKey, {
      university_name: site.university_name,
      college_name: site.college_name,
      recipient_name: data.recipientName ?? undefined,
      ...data.variables,
    });

    // 3) Send via Resend connector gateway
    const lovableKey = process.env.LOVABLE_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;

    if (!lovableKey || !resendKey) {
      await supabase.from("email_logs").insert({
        template_name: data.templateKey,
        recipient_email: data.recipientEmail,
        subject: rendered.subject,
        status: "failed",
        error_message: "Email service not configured (missing keys)",
        related_entity_type: data.relatedEntityType ?? null,
        related_entity_id: data.relatedEntityId ?? null,
        triggered_by: triggeredBy ?? null,
        metadata: {},
      });
      return { ok: false, error: "not_configured" };
    }

    try {
      const resp = await fetch(`${GATEWAY_URL}/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": resendKey,
        },
        body: JSON.stringify({
          from: `${site.from_name} <${site.from_email}>`,
          to: [data.recipientEmail],
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        }),
      });

      const respText = await resp.text();
      let respJson: Record<string, unknown> = {};
      try { respJson = JSON.parse(respText); } catch { /* keep text */ }

      if (!resp.ok) {
        await supabase.from("email_logs").insert({
          template_name: data.templateKey,
          recipient_email: data.recipientEmail,
          subject: rendered.subject,
          status: "failed",
          error_message: `HTTP ${resp.status}: ${respText.slice(0, 500)}`,
          related_entity_type: data.relatedEntityType ?? null,
          related_entity_id: data.relatedEntityId ?? null,
          triggered_by: triggeredBy ?? null,
          metadata: { http_status: resp.status },
        });
        // Audit important failures
        await supabase.from("audit_logs").insert({
          action_type: "email_send_failed",
          entity_type: "email",
          actor_user_id: triggeredBy ?? null,
          new_values: { template: data.templateKey, recipient: data.recipientEmail, http_status: resp.status },
        }).then(() => undefined, () => undefined);
        return { ok: false, error: `http_${resp.status}` };
      }

      const providerMessageId =
        typeof respJson.id === "string" ? respJson.id : null;

      await supabase.from("email_logs").insert({
        template_name: data.templateKey,
        recipient_email: data.recipientEmail,
        subject: rendered.subject,
        status: "sent",
        provider_message_id: providerMessageId,
        related_entity_type: data.relatedEntityType ?? null,
        related_entity_id: data.relatedEntityId ?? null,
        triggered_by: triggeredBy ?? null,
        metadata: {},
      });
      return { ok: true as const, providerMessageId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase.from("email_logs").insert({
        template_name: data.templateKey,
        recipient_email: data.recipientEmail,
        subject: rendered.subject,
        status: "failed",
        error_message: msg.slice(0, 500),
        related_entity_type: data.relatedEntityType ?? null,
        related_entity_id: data.relatedEntityId ?? null,
        triggered_by: triggeredBy ?? null,
        metadata: {},
      });
      return { ok: false, error: "network_error" };
    }
  });
