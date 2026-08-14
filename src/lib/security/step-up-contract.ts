/**
 * Canonical Step-up (biometric) contract — PORTAL_MOBILE_BIOMETRIC_APP_LOCK_AND_STEP_UP_SECURITY_01.
 *
 * Pure, platform-free module: no Capacitor, no Supabase, no DOM.
 * It defines WHICH actions require a step-up proof and WHAT exactly is signed.
 *
 * Security invariants encoded here:
 *  - The signature covers the operation payload, not only its identifiers, so a
 *    confirmed request cannot be mutated between confirmation and submit.
 *  - Proofs are short-lived and single-use; the server is the only authority.
 *  - No biometric material is ever part of any structure in this file.
 */

/** Canonical sensitive services requiring biometric step-up before submit. */
export const STEP_UP_SENSITIVE_SERVICES = [
  "file_withdrawal",
  "enrollment_suspension",
  "department_transfer",
  "final_chance",
  "excused_absence",
] as const;

export type StepUpSensitiveService = (typeof STEP_UP_SENSITIVE_SERVICES)[number];

/** Proof lifetime policy (server re-validates; the client never decides). */
export const STEP_UP_PROOF_TTL_SECONDS = 120;
/** Signing message version — bumping invalidates old client signatures. */
export const STEP_UP_SIGNING_VERSION = "usrp-stepup-v1";

export type StepUpActionDescriptor = {
  readonly actionCode: `submit_${StepUpSensitiveService}`;
  readonly titleAr: string;
  readonly summaryAr: string;
  readonly consequencesAr: readonly string[];
};

const DESCRIPTORS: Record<StepUpSensitiveService, StepUpActionDescriptor> = {
  file_withdrawal: {
    actionCode: "submit_file_withdrawal",
    titleAr: "تأكيد سحب الملف",
    summaryAr: "أنت على وشك إرسال طلب سحب ملفك من الكلية.",
    consequencesAr: [
      "يبدأ إجراء إنهاء علاقتك الأكاديمية بالكلية بعد اكتمال الموافقات.",
      "قد يتطلب استئناف الدراسة لاحقًا إجراءات قبول جديدة.",
      "لا يمكن التراجع عن الطلب بعد الإرسال إلا عبر الجهة المختصة.",
    ],
  },
  enrollment_suspension: {
    actionCode: "submit_enrollment_suspension",
    titleAr: "تأكيد إيقاف القيد",
    summaryAr: "أنت على وشك إرسال طلب إيقاف قيدك للفصل/الفترة المحددة.",
    consequencesAr: [
      "يتم تعليق تسجيلك الأكاديمي خلال فترة الإيقاف بعد الاعتماد.",
      "قد تتأثر مدتك النظامية للتخرج.",
      "لا يمكن تعديل الطلب بعد الإرسال.",
    ],
  },
  department_transfer: {
    actionCode: "submit_department_transfer",
    titleAr: "تأكيد طلب التحويل",
    summaryAr: "أنت على وشك إرسال طلب تحويل إلى قسم/برنامج آخر.",
    consequencesAr: [
      "قد تتغير خطتك الدراسية والمقررات المعتمدة عند الموافقة.",
      "قد تخضع مقرراتك السابقة لإعادة المعادلة.",
      "لا يمكن تعديل الطلب بعد الإرسال.",
    ],
  },
  final_chance: {
    actionCode: "submit_final_chance",
    titleAr: "تأكيد طلب الفرصة النهائية",
    summaryAr: "أنت على وشك إرسال طلب فرصة نهائية.",
    consequencesAr: [
      "يُعد الطلب إقرارًا باستنفاد الفرص النظامية السابقة.",
      "يخضع القرار للجهة الأكاديمية المختصة ولا يُضمن قبوله.",
      "لا يمكن تعديل الطلب بعد الإرسال.",
    ],
  },
  excused_absence: {
    actionCode: "submit_excused_absence",
    titleAr: "تأكيد طلب الغياب بعذر",
    summaryAr: "أنت على وشك إرسال طلب غياب بعذر للمقرر المحدد.",
    consequencesAr: [
      "تُحال المرفقات للجهة المختصة للتحقق من صحتها.",
      "قد يترتب على تقديم بيانات غير صحيحة إجراء نظامي.",
      "لا يمكن تعديل الطلب بعد الإرسال.",
    ],
  },
};

export function isStepUpSensitiveService(code: string): code is StepUpSensitiveService {
  return (STEP_UP_SENSITIVE_SERVICES as readonly string[]).includes(code);
}

export function getStepUpDescriptor(code: string): StepUpActionDescriptor | null {
  return isStepUpSensitiveService(code) ? DESCRIPTORS[code] : null;
}

/** Stable, order-independent JSON used as the signed payload representation. */
export function canonicalizeStepUpPayload(value: unknown): string {
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === "object") {
      const source = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(source).sort()) {
        const child = source[key];
        if (child === undefined) continue;
        out[key] = walk(child);
      }
      return out;
    }
    return input;
  };
  return JSON.stringify(walk(value) ?? null);
}

export type StepUpSigningInput = {
  readonly challengeId: string;
  readonly nonce: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly actionCode: string;
  readonly requestId: string;
  readonly payloadHash: string;
  readonly expiresAt: string;
};

/**
 * The exact string signed by the Keystore-held private key. Every field the
 * server re-derives must appear here — otherwise the proof is not bound to it.
 */
export function buildStepUpSigningMessage(input: StepUpSigningInput): string {
  return [
    STEP_UP_SIGNING_VERSION,
    input.challengeId,
    input.nonce,
    input.userId,
    input.deviceId,
    input.actionCode,
    input.requestId,
    input.payloadHash,
    input.expiresAt,
  ].join("|");
}

/** SHA-256 hex of the canonical payload (Web Crypto; available in app + tests). */
export async function hashStepUpPayload(payload: unknown): Promise<string> {
  const canonical = canonicalizeStepUpPayload(payload);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Denial reasons the UI may surface. Never includes biometric details. */
export const STEP_UP_MESSAGES_AR = {
  canceled: "تم إلغاء التحقق بالبصمة. لم يتم إرسال الطلب.",
  failed: "تعذّر التحقق بالبصمة. لم يتم إرسال الطلب.",
  unavailable:
    "هذه العملية تتطلب التحقق بالبصمة من تطبيق الجوال بعد تفعيل قفل التطبيق من الإعدادات.",
  expired: "انتهت صلاحية التحقق. أعد المحاولة.",
  deviceUntrusted: "هذا الجهاز غير موثوق. فعّل قفل التطبيق من الإعدادات ثم أعد المحاولة.",
} as const;
