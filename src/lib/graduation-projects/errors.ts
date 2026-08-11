/**
 * Arabic-mapped error families for Graduation Projects MVP.
 * Authorization denials are never swallowed into generic “try later” messages.
 */

export const GRADUATION_PROJECTS_SERVICE_UPDATING_MSG =
  "خدمة مشاريع التخرج قيد التحديث حالياً. حاول لاحقاً.";

export type RpcErrorLike = { message?: string; code?: string; details?: string; hint?: string };

export type GpErrorFamily =
  | "authorization"
  | "precondition"
  | "validation"
  | "stale_version"
  | "idempotency"
  | "unavailable"
  | "unknown";

export class GraduationProjectsRpcError extends Error {
  readonly code: string;
  readonly unavailable: boolean;
  readonly family: GpErrorFamily;
  readonly staleVersion: boolean;
  readonly authorizationDenied: boolean;

  constructor(
    message: string,
    options: {
      code?: string;
      unavailable?: boolean;
      family?: GpErrorFamily;
      staleVersion?: boolean;
      authorizationDenied?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "GraduationProjectsRpcError";
    this.code = options.code ?? "";
    this.unavailable = options.unavailable ?? false;
    this.family = options.family ?? "unknown";
    this.staleVersion = options.staleVersion ?? false;
    this.authorizationDenied = options.authorizationDenied ?? false;
  }
}

/** Exact / family messages mapped to Arabic (freeze denial vocabulary). */
export const ERROR_LABELS: Record<string, string> = {
  "exact direct processing assignment required": "لا تملك تعييناً مباشراً نشطاً يسمح بهذا الإجراء",
  "project creation assignment required": "إنشاء المشاريع يتطلب تعييناً نشطاً كمنسق في القسم",
  "project not found": "المشروع غير موجود",
  "leader assignment required": "هذا الإجراء مقصور على قائد الفريق",
  "member mutation denied": "لا يمكن تعديل عضوية الفريق في الحالة الحالية",
  "one active team per student": "لا يمكن للطالب الانتماء لأكثر من فريق تخرج نشط",
  "proposal fields incomplete": "حقول المقترح غير مكتملة",
  "proposal attachment required": "مرفق المقترح مطلوب قبل التقديم",
  "proposal review action unknown": "إجراء المراجعة غير معروف",
  "proposal review precondition failed": "لا يمكن تنفيذ إجراء المراجعة في الحالة الحالية أو برقم النسخة الحالي",
  "review reason required": "السبب مطلوب لهذا القرار",
  "review comments required": "التعليقات مطلوبة لهذا القرار",
  "proposal resubmission precondition failed": "إعادة التقديم تتطلب حالة «يتطلب تعديلاً» ورقم النسخة الصحيح",
  "proposal transition precondition failed": "لا يمكن تقديم المقترح في الحالة الحالية",
  "supervisor cardinality violated": "يجب أن يكون هناك مشرف واحد فقط بحالة بانتظار القبول أو مقبول",
  "supervision response denied": "لا يمكن قبول أو رفض الإشراف في الحالة الحالية",
  "supervisor not accepted": "مراجعة التقدم أو التسليم النهائي تتطلب مشرفاً مقبولاً",
  "progress review precondition failed": "لا يمكن مراجعة التقدم في الحالة الحالية",
  "final review precondition failed": "لا يمكن مراجعة النسخة النهائية في الحالة الحالية",
  "defense scheduling precondition failed": "لا يمكن جدولة مناقشة مشروع التخرج في الحالة الحالية",
  "defense schedule details invalid": "موعد المناقشة ومكانها مطلوبان",
  "committee assignment precondition failed": "تعيين اللجنة يتطلب مناقشة مجدولة",
  "committee size insufficient": "يلزم عضوان على الأقل في لجنة المناقشة",
  "evaluation write precondition failed": "التقييم يتطلب مناقشة منعقدة وعضوية مباشرة في اللجنة",
  "evaluation scores invalid": "درجة التقييم غير صالحة (0–100)",
  "evaluation already submitted": "التقييم أُرسل مسبقاً ولا يمكن تعديله",
  "result outcome unknown": "النتيجة النهائية غير معروفة",
  "result conclusion precondition failed": "تسجيل النتيجة يتطلب حالة «قيد التقييم» واكتمال التقييمات ورقم النسخة الصحيح",
  "evaluations not finalized": "يجب إرسال جميع تقييمات اللجنة قبل تسجيل النتيجة",
  "archive precondition failed": "الأرشفة تتطلب نتيجة نهائية ناجح أو راسب ومشروعاً غير مؤرشف",
  "project not archive-ready": "المشروع ليس جاهزاً للأرشفة",
  "direct archive assignment required": "الأرشفة تتطلب تعييناً مباشراً كمنسق",
  "file object key outside project scope": "مفتاح الملف خارج نطاق المشروع",
  "file metadata invalid": "بيانات الملف الوصفية غير مكتملة أو غير صالحة",
  "file object key already registered": "مفتاح الملف مسجَّل مسبقاً",
  "file registration state denied": "حالة المشروع لا تسمح بتسجيل الملفات",
  "signed download denied": "التحميل الموقّع غير مسموح لهذا الملف أو المستخدم",
  "administration overview denied": "عرض الإدارة غير مسموح دون تفويض صريح",
  "administration graduation-project viewer capability required":
    "عفواً، لا تملك الصلاحية الكافية لاستعراض النشرة الإدارية لمشاريع التخرج.",
  "stale project version": "تغيرت بيانات المشروع. حدّث الصفحة ثم أعد المحاولة",
  "version mismatch": "تغيرت بيانات المشروع. حدّث الصفحة ثم أعد المحاولة",
  "project title invalid": "عنوان المشروع غير صالح",
  "team mutation state denied": "حالة المشروع لا تسمح بتعديل الفريق",
  "fourth-level student eligibility required":
    "مشاريع التخرج متاحة فقط لطلاب المستوى الرابع الحاليين",
  // retained draft strings still emitted until Package A applies freeze deltas
  "project activation precondition failed": "التفعيل يتطلب مشروعاً معتمداً ورقم النسخة الصحيح",
  "faculty assignment role denied": "لا يمكن تعيين هذا الدور عبر هذه الخدمة",
  "faculty assignment state denied": "حالة المشروع لا تسمح بالتعيين",
  "faculty assignment already exists": "لدى هذا المستخدم تعيين نشط بنفس الدور على هذا المشروع",
  "panel member already assigned": "عضو اللجنة معيَّن لهذه المناقشة مسبقاً",
  "assignment end state denied": "لا يمكن إنهاء التعيينات في حالة نهائية",
  "assignment not found": "التعيين غير موجود",
  "cannot end own assignment": "لا يمكنك إنهاء تعيينك الخاص",
  "deliverable submission state denied": "حالة المشروع لا تسمح بالتسليم",
  "milestone not found": "المرحلة غير موجودة",
  "submission review action unknown": "إجراء مراجعة التسليم غير معروف",
  "submission review precondition failed": "لا يمكن مراجعة التسليم في الحالة الحالية",
  "revision note required": "ملاحظة التعديل مطلوبة",
  "note state denied": "حالة المشروع لا تسمح بالملاحظات",
  "note text required": "نص الملاحظة مطلوب",
  "submission not found": "التسليم غير موجود",
  "note resolution precondition failed": "لا يمكن معالجة هذه الملاحظة",
  "discussion scheduling precondition failed": "لا يمكن جدولة المناقشة في الحالة الحالية",
  "discussion schedule details invalid": "موعد المناقشة ومكانها مطلوبان",
  "discussion rejection precondition failed": "لا يمكن رفض طلب المناقشة في الحالة الحالية",
  "discussion not found": "المناقشة غير موجودة",
  "panel assignment precondition failed": "تعيين اللجنة يتطلب مناقشة مجدولة وعضو لجنة نشطاً",
  "discussion outcome unknown": "نتيجة المناقشة غير معروفة",
  "discussion outcome precondition failed": "لا يمكن تسجيل نتيجة المناقشة في الحالة الحالية",
  "evaluation lifecycle precondition failed": "لا يمكن اعتماد التقييم في الحالة الحالية",
  "evaluation finalization precondition failed": "لا يمكن اعتماد التقييم في الحالة الحالية",
  "corrections payload invalid": "قائمة التصحيحات غير صالحة",
  "correction completion precondition failed": "لا يمكن إتمام هذا التصحيح في الحالة الحالية",
  "correction acceptance precondition failed": "قبول التصحيح يتطلب إتمامه مسبقاً",
  "department report assignment required": "تقارير القسم تتطلب تعييناً إدارياً نشطاً في القسم",
  "clean accepted final evidence and accepted corrections required":
    "الأرشفة تتطلب ملفاً نهائياً سليم الفحص ومقبولاً",
  "discussion readiness failed": "المشروع غير جاهز لطلب المناقشة",
  "graduation project events are append-only": "سجل الأحداث للإضافة فقط",
  "milestone mutation state denied": "حالة المشروع لا تسمح بتعديل المراحل",
};

const AUTHORIZATION_MESSAGE_FRAGMENTS = [
  "exact direct processing assignment required",
  "project creation assignment required",
  "leader assignment required",
  "signed download denied",
  "administration overview denied",
  "administration graduation-project viewer capability required",
  "viewer capability required",
  "direct archive assignment required",
  "department report assignment required",
  "supervision response denied",
  "faculty assignment role denied",
  "cannot end own assignment",
  "evaluation write precondition failed",
  "fourth-level student eligibility required",
] as const;

const STALE_VERSION_FRAGMENTS = [
  "stale project version",
  "version mismatch",
  "proposal review precondition failed",
  "proposal resubmission precondition failed",
  "result conclusion precondition failed",
  "proposal transition precondition failed",
] as const;

export function isGraduationProjectsRpcUnavailable(error: RpcErrorLike | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  const code = error.code ?? "";
  return (
    code === "42883"
    || /function .* does not exist/i.test(msg)
    || /could not find the function/i.test(msg)
    || /schema cache/i.test(msg)
  );
}

function normalizeMessage(message: string): string {
  return message.trim().replace(/\s+/g, " ");
}

function matchLabel(message: string): string | undefined {
  const normalized = normalizeMessage(message);
  if (ERROR_LABELS[normalized]) return ERROR_LABELS[normalized];
  const lower = normalized.toLowerCase();
  for (const [key, label] of Object.entries(ERROR_LABELS)) {
    if (lower.includes(key.toLowerCase())) return label;
  }
  return undefined;
}

export function classifyGpError(error: RpcErrorLike): GpErrorFamily {
  if (isGraduationProjectsRpcUnavailable(error)) return "unavailable";
  const msg = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";

  if (
    code === "42501"
    || code === "28000"
    || /permission denied|not authorized|authorization|insufficient_privilege/i.test(msg)
    || AUTHORIZATION_MESSAGE_FRAGMENTS.some((fragment) => msg.includes(fragment))
  ) {
    return "authorization";
  }

  if (
    /stale project version|version mismatch|p_expected_version/i.test(msg)
    || STALE_VERSION_FRAGMENTS.some((fragment) => msg.includes(fragment) && /version/i.test(msg))
  ) {
    return "stale_version";
  }

  if (/correlation|idempoten|already submitted|already registered|already exists/i.test(msg)) {
    return "idempotency";
  }

  if (/invalid|required|incomplete|cardinality|size insufficient|scores invalid/i.test(msg)) {
    return "validation";
  }

  if (/precondition|state denied|not archive-ready|not accepted/i.test(msg)) {
    return "precondition";
  }

  return "unknown";
}

export function isAuthorizationDenial(error: RpcErrorLike | GraduationProjectsRpcError): boolean {
  if (error instanceof GraduationProjectsRpcError) return error.authorizationDenied;
  return classifyGpError(error) === "authorization";
}

export function isStaleVersionError(error: RpcErrorLike | GraduationProjectsRpcError): boolean {
  if (error instanceof GraduationProjectsRpcError) return error.staleVersion;
  const msg = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";
  return (
    classifyGpError(error) === "stale_version"
    || /stale project version|version mismatch/i.test(msg)
    || code === "P0002"
  );
}

/**
 * Maps RPC errors to Arabic user-facing text.
 * Authorization denials keep their specific Arabic assignment message — never
 * replaced by the unavailable/service-updating fallback.
 */
export function mapGraduationProjectRpcError(error: RpcErrorLike): GraduationProjectsRpcError {
  const family = classifyGpError(error);
  if (family === "unavailable") {
    return new GraduationProjectsRpcError(GRADUATION_PROJECTS_SERVICE_UPDATING_MSG, {
      code: error.code ?? "",
      unavailable: true,
      family: "unavailable",
    });
  }

  const msg = error.message ?? "";
  const label = matchLabel(msg) ?? (msg.trim() || "حدث خطأ غير متوقع");
  const authorizationDenied = family === "authorization";
  const staleVersion = family === "stale_version" || /stale project version|version mismatch/i.test(msg);

  return new GraduationProjectsRpcError(label, {
    code: error.code ?? "",
    family: staleVersion ? "stale_version" : family,
    authorizationDenied,
    staleVersion,
  });
}
