import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, Output, streamText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "@/lib/ai/run-id.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export type GuideService = {
  code: string;
  name_ar: string;
  description_ar: string | null;
  requires_attachment: boolean | null;
  is_eligible: boolean | null;
  disabled_reason: string | null;
};

export type ServiceGuideResult = {
  matched_service_code: string | null;
  matched_service_name: string | null;
  can_apply: boolean;
  summary: string;
  requirements: string[];
  steps: string[];
  notes: string;
};

const schema = z.object({
  matched_service_code: z.string().nullable(),
  summary: z.string(),
  requirements: z.array(z.string()),
  steps: z.array(z.string()),
  notes: z.string(),
});

export class ServiceGuideError extends Error {}

export function friendlyGatewayError(error: unknown): string {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  if (status === 429) return "المساعد مشغول حاليًا، حاول بعد قليل.";
  if (status === 402 || status === 403) return "المساعد غير متاح حاليًا. يرجى التواصل مع شؤون الطلاب.";
  return "تعذّر الحصول على إجابة من المساعد، حاول مرة أخرى.";
}

export async function runServiceGuide(question: string, services: GuideService[]): Promise<ServiceGuideResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new ServiceGuideError("المساعد غير مهيأ حاليًا.");

  const catalog = services.map((s) => ({
    code: s.code,
    name: s.name_ar,
    description: s.description_ar ?? "",
    requires_attachment: Boolean(s.requires_attachment),
    student_can_apply_now: s.is_eligible !== false,
    unavailable_reason: s.disabled_reason ?? "",
  }));

  const system = [
    "أنت مساعد الخدمات الطلابية في بوابة الكلية. أجب بالعربية الفصحى المبسطة.",
    "اعتمد فقط على قائمة الخدمات المتاحة المرفقة بصيغة JSON، ولا تخترع خدمات أو شروطًا أو رسومًا أو مبالغ أو مواعيد غير مذكورة.",
    "اختر الخدمة الأنسب لوصف الطالب وضع رمزها في matched_service_code، أو null إن لم تطابق أي خدمة.",
    "requirements: المتطلبات والمستندات المستنتجة من وصف الخدمة (اذكر المرفق إن كان requires_attachment=true). steps: خطوات مختصرة داخل البوابة: فتح «الخدمات الطلابية» ثم «طلب جديد» واختيار الخدمة وتعبئة النموذج وإرفاق المستندات والإرسال ومتابعة الحالة.",
    "إن كانت الخدمة مدفوعة فوجّه الطالب للسداد في النظام الجامعي الرئيسي دون ذكر مبالغ.",
    "إن كان student_can_apply_now=false فاذكر السبب في notes. إن لم تطابق خدمة، انصح بمراجعة شؤون الطلاب في notes.",
    "اجعل كل بند قصيرًا، بحد أقصى 6 متطلبات و6 خطوات.",
    `الخدمات المتاحة: ${JSON.stringify(catalog)}`,
  ].join("\n");

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  let output: z.infer<typeof schema>;
  try {
    const result = streamText({
      model: provider.responses(MODEL),
      system,
      prompt: question,
      maxRetries: 0,
      output: Output.object({ schema }),
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    output = await result.output;
  } catch (error) {
    console.error("[service-guide] gateway error", error);
    throw new ServiceGuideError(friendlyGatewayError(error));
  }

  const matched = services.find((s) => s.code === output.matched_service_code) ?? null;
  return {
    matched_service_code: matched?.code ?? null,
    matched_service_name: matched?.name_ar ?? null,
    can_apply: Boolean(matched && matched.is_eligible !== false),
    summary: output.summary.trim(),
    requirements: output.requirements.map((r) => r.trim()).filter(Boolean).slice(0, 6),
    steps: output.steps.map((r) => r.trim()).filter(Boolean).slice(0, 6),
    notes: output.notes.trim(),
  };
}
