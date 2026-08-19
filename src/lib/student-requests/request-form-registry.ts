/**
 * Static form definitions for canonical student request types (P4 foundation).
 * Display-only / form_data staging — detail tables and RPC validation come later.
 */

import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";

export type RequestFormFieldType =
  | "text"
  | "textarea"
  | "select"
  | "multi_select"
  | "date"
  | "date_range"
  | "file"
  | "checkbox"
  | "readonly"
  | "info";

export type RequestFormFieldOption = {
  value: string;
  labelAr: string;
};

export type RequestFormFieldDependsOn = {
  field: string;
  equals?: string | boolean;
};

export type RequestFormFieldDefinition = {
  name: string;
  labelAr: string;
  type: RequestFormFieldType;
  required?: boolean;
  options?: readonly RequestFormFieldOption[];
  helperTextAr?: string;
  placeholderAr?: string;
  dependsOn?: RequestFormFieldDependsOn;
  defaultValue?: string | boolean | readonly string[];
  referenceResolverKey?:
    | "academic_years"
    | "semesters_for_year"
    | "current_student_enrollments"
    | "available_departments"
    | "available_programs"
    | "october_remaining_required_courses"
    | "published_final_results";
  referenceDependsOnField?: string;
};

export type RequestFormSection = {
  titleAr?: string;
  fields: readonly RequestFormFieldDefinition[];
};

export type RequestFormAttachmentRequirement = {
  key: string;
  labelAr: string;
  required?: boolean;
};

export type RequestFormDefinition = {
  code: string;
  titleAr: string;
  descriptionAr?: string;
  sections: readonly RequestFormSection[];
  requiredAttachments?: readonly RequestFormAttachmentRequirement[];
  warnings?: readonly string[];
  /** When true, UI shows that full detail persistence awaits schema apply. */
  unavailableUntilSchemaApplied: boolean;
};

/* P1: placeholder option arrays removed — every reference list is resolved
   server-side from authoritative tables via referenceResolverKey. */


const COPY_COUNT_OPTIONS: readonly RequestFormFieldOption[] = [
  { value: "1", labelAr: "نسخة واحدة" },
  { value: "2", labelAr: "نسختان" },
  { value: "3", labelAr: "3 نسخ" },
  { value: "4", labelAr: "4 نسخ" },
  { value: "5", labelAr: "5 نسخ" },
];

const SCHEMA_PENDING = true;

/**
 * P1 atomic services whose backend contract (P1-01..P1-09) is live in
 * production and E2E-attested — their forms are fully available in source.
 */
const P1_ATOMIC_SCHEMA_APPLIED = false;

const ENROLLMENT_SUSPENSION: RequestFormDefinition = {
  code: "enrollment_suspension",
  titleAr: "وقف القيد",
  descriptionAr: "طلب إيقاف القيد لفصل أو فترة أكاديمية وفق ضوابط الكلية.",
  unavailableUntilSchemaApplied: SCHEMA_PENDING,
  warnings: ["الأهلية النهائية تُتحقق لاحقاً من النظام ولا تعتمد على هذا النموذج فقط."],
  sections: [
    {
      titleAr: "بيانات وقف القيد",
      fields: [
        {
          name: "target_academic_year",
          labelAr: "العام الجامعي المطلوب",
          type: "select",
          required: true,
          referenceResolverKey: "academic_years",
        },
        {
          name: "target_semester",
          labelAr: "الفصل المطلوب وقف القيد له",
          type: "select",
          required: true,
          referenceResolverKey: "semesters_for_year",
          referenceDependsOnField: "target_academic_year",
        },
        {
          name: "academic_context",
          labelAr: "العام الجامعي / الفصل الحالي",
          type: "readonly",
          defaultValue: "— يُعرض تلقائياً من السياق الأكاديمي عند التفعيل —",
        },
        {
          name: "suspension_reason",
          labelAr: "سبب وقف القيد",
          type: "textarea",
          required: true,
          placeholderAr: "اذكر سبب طلب وقف القيد باختصار",
          helperTextAr: "لا يتطلب هذا النوع مرفقاً في المرحلة الحالية.",
        },
        {
          name: "suspension_duration_type",
          labelAr: "مدة وقف القيد",
          type: "select",
          required: true,
          options: [
            { value: "one_semester", labelAr: "فصل دراسي واحد" },
            { value: "full_year", labelAr: "عام جامعي كامل" },
          ],
        },
        {
          name: "terms_acknowledgment",
          labelAr: "أقرّ بأنني اطلعت على شروط وقف القيد المعتمدة في الكلية",
          type: "checkbox",
          required: true,
        },
        {
          name: "eligibility_note",
          labelAr: "ملاحظة",
          type: "info",
          defaultValue:
            "الأهلية النهائية لوقف القيد (عدد فترات الوقف السابقة، حالة القيد، إلخ) تُتحقق لاحقاً من النظام وليس من واجهة النموذج فقط.",
        },
      ],
    },
  ],
};

const GRADE_STATEMENT_NON_GRADUATE: RequestFormDefinition = {
  code: "grade_statement_non_graduate",
  titleAr: "شهادة تقديرات لغير الخريجين",
  descriptionAr: "طلب شهادة تقديرات للطلاب غير الخريجين.",
  unavailableUntilSchemaApplied: SCHEMA_PENDING,
  sections: [
    {
      fields: [
        {
          name: "purpose",
          labelAr: "الغرض من الشهادة",
          type: "textarea",
          required: true,
          placeholderAr: "مثال: التقديم لجهة عمل أو جهة خارجية",
        },
        {
          name: "copies_count",
          labelAr: "عدد النسخ",
          type: "select",
          required: true,
          options: COPY_COUNT_OPTIONS,
        },
        {
          name: "recipient",
          labelAr: "جهة التقديم (إن وجدت)",
          type: "text",
          placeholderAr: "اسم الجهة أو الجهة المستلمة",
        },
        {
          name: "non_graduate_note",
          labelAr: "ملاحظة",
          type: "info",
          defaultValue:
            "هذا الطلب مخصص للطلاب غير الخريجين فقط. يُخفى عن الخريجين وفق إعدادات الجمهور.",
        },
      ],
    },
  ],
};

const ENROLLMENT_CERTIFICATE: RequestFormDefinition = {
  code: "enrollment_certificate",
  titleAr: "شهادة قيد",
  descriptionAr: "طلب شهادة قيد للطالب المسجل.",
  unavailableUntilSchemaApplied: SCHEMA_PENDING,
  sections: [
    {
      fields: [
        {
          name: "purpose",
          labelAr: "الغرض من شهادة القيد",
          type: "textarea",
          required: true,
        },
        {
          name: "copies_count",
          labelAr: "عدد النسخ",
          type: "select",
          required: true,
          options: COPY_COUNT_OPTIONS,
        },
        {
          name: "recipient",
          labelAr: "جهة التقديم",
          type: "text",
          required: true,
          placeholderAr: "الجهة التي تُقدَّم لها الشهادة",
        },
        {
          name: "internal_only_note",
          labelAr: "ملاحظة",
          type: "info",
          defaultValue:
            "شهادة القيد خدمة داخلية للكلية ولا تحتاج توقيعات الجامعة المركزية في هذه المرحلة.",
        },
      ],
    },
  ],
};

const FILE_WITHDRAWAL: RequestFormDefinition = {
  code: "file_withdrawal",
  titleAr: "سحب ملف",
  descriptionAr: "طلب سحب الملف الأكاديمي من الكلية.",
  unavailableUntilSchemaApplied: SCHEMA_PENDING,
  sections: [
    {
      fields: [
        {
          name: "withdrawal_reason",
          labelAr: "سبب سحب الملف",
          type: "textarea",
          required: true,
        },
        {
          name: "impact_acknowledgment",
          labelAr: "أفهم أن سحب الملف له أثر أكاديمي وإداري وفق لوائح الكلية",
          type: "checkbox",
          required: true,
        },
        {
          name: "clearance_library",
          labelAr: "إخلاء طرف — المكتبة",
          type: "readonly",
          defaultValue: "يُتحقق لاحقاً من إخلاء طرف المكتبة (غير منفَّذ في هذه المرحلة).",
        },
        {
          name: "clearance_labs",
          labelAr: "إخلاء طرف — المعامل",
          type: "readonly",
          defaultValue: "يُتحقق لاحقاً من إخلاء طرف المعامل.",
        },
        {
          name: "clearance_activities",
          labelAr: "إخلاء طرف — الأنشطة",
          type: "readonly",
          defaultValue: "يُتحقق لاحقاً من إخلاء طرف الأنشطة الطلابية.",
        },
        {
          name: "clearance_finance",
          labelAr: "إخلاء طرف — الشؤون المالية",
          type: "readonly",
          defaultValue: "يُتحقق لاحقاً من إخلاء طرف الشؤون المالية.",
        },
      ],
    },
  ],
};

const EXCUSED_ABSENCE: RequestFormDefinition = {
  code: "excused_absence",
  titleAr: "غياب بعذر",
  descriptionAr: "طلب تسجيل غياب بعذر مقبول.",
  unavailableUntilSchemaApplied: SCHEMA_PENDING,
  requiredAttachments: [
    { key: "excuse_documents", labelAr: "مرفقات العذر (وثائق داعمة)", required: true },
  ],
  warnings: ["الخدمة تعتمد على فترة تفعيل يحددها الأدمن."],
  sections: [
    {
      fields: [
        {
          name: "absence_date",
          labelAr: "تاريخ بداية الغياب",
          type: "date",
          required: true,
        },
        {
          name: "reason_type",
          labelAr: "نوع العذر",
          type: "select",
          required: true,
          options: [
            { value: "medical", labelAr: "طبي" },
            { value: "family_emergency", labelAr: "طارئ عائلي" },
            { value: "official", labelAr: "رسمي" },
            { value: "other", labelAr: "أخرى" },
          ],
        },
        {
          name: "absence_reason_detail",
          labelAr: "سبب الغياب",
          type: "textarea",
          required: true,
          placeholderAr: "مثال: ظرف طبي، ظرف عائلي طارئ",
        },
        {
          name: "course_section_id",
          labelAr: "المقرر",
          type: "select",
          required: true,
          referenceResolverKey: "current_student_enrollments",
          helperTextAr: "تُحمّل من تسجيلات الطالب الحالية، ويعاد التحقق منها على الخادم.",
        },
        {
          name: "excuse_documents",
          labelAr: "مرفقات العذر",
          type: "file",
          required: true,
          helperTextAr: "مطلوب في الواجهة. رفع الملفات الفعلي يُفعَّل بعد تطبيق مخطط الطلبات.",
        },
        {
          name: "service_window_note",
          labelAr: "ملاحظة",
          type: "info",
          defaultValue:
            "تقديم طلب الغياب بعذر مرتبط بفترة تفعيل الخدمة التي يحددها مسؤول شؤون الطلاب.",
        },
      ],
    },
  ],
};

const GRADE_APPEAL: RequestFormDefinition = {
  code: "grade_appeal",
  titleAr: "تقديم تظلم",
  descriptionAr: "تظلم رسمي على نتيجة نهائية منشورة، خلال 7 أيام من تاريخ إعلانها.",
  unavailableUntilSchemaApplied: P1_ATOMIC_SCHEMA_APPLIED,
  warnings: [
    "يُقبل التظلم فقط على النتائج النهائية المنشورة رسمياً وخلال 7 أيام من تاريخ الإعلان.",
    "اختر المقرر من النتائج المؤهلة الظاهرة؛ يتحقق الخادم من الملكية والمهلة مرة أخرى عند الإرسال.",
  ],
  sections: [
    {
      titleAr: "بيانات النتيجة محل التظلم",
      fields: [
        {
          name: "final_result_id",
          labelAr: "المقرر والنتيجة النهائية",
          type: "select",
          required: true,
          referenceResolverKey: "published_final_results",
          helperTextAr: "تظهر فقط نتائجك النهائية المنشورة التي ما زالت ضمن مهلة التظلم.",
        },
        {
          name: "appeal_reason",
          labelAr: "سبب التظلم",
          type: "textarea",
          required: true,
          placeholderAr: "اشرح موضع الاعتراض على النتيجة بوضوح",
          helperTextAr: "لا تطلب درجة بديلة؛ اذكر سبب طلب المراجعة فقط.",
        },
        {
          name: "results_note",
          labelAr: "ما الذي يحدث بعد الإرسال؟",
          type: "info",
          defaultValue:
            "يراجع الطلب مسجل الكلية ثم رئيس القسم وأستاذ المقرر، ولا تتغير النتيجة إلا بقرار أكاديمي معتمد.",
        },
      ],
    },
  ],
};

const DEPARTMENT_TRANSFER: RequestFormDefinition = {
  code: "department_transfer",
  titleAr: "تحويل من قسم إلى قسم",
  descriptionAr: "طلب التحويل بين الأقسام أو البرامج.",
  unavailableUntilSchemaApplied: SCHEMA_PENDING,
  requiredAttachments: [
    { key: "secondary_certificate", labelAr: "شهادة الثانوية العامة", required: true },
  ],
  sections: [
    {
      fields: [
        {
          name: "current_department",
          labelAr: "القسم الحالي",
          type: "readonly",
          defaultValue: "— يُعرض من ملف الطالب عند التفعيل —",
        },
        {
          name: "current_program",
          labelAr: "البرنامج الحالي",
          type: "readonly",
          defaultValue: "— يُعرض من ملف الطالب عند التفعيل —",
        },
        {
          name: "target_department_id",
          labelAr: "القسم المطلوب",
          type: "select",
          required: true,
          referenceResolverKey: "available_departments",
        },
        {
          name: "target_program_id",
          labelAr: "البرنامج المطلوب",
          type: "select",
          required: true,
          referenceResolverKey: "available_programs",
          referenceDependsOnField: "target_department_id",
        },
        {
          name: "transfer_reason",
          labelAr: "سبب التحويل",
          type: "textarea",
          required: true,
        },
        {
          name: "secondary_certificate_file",
          labelAr: "مرفق شهادة الثانوية",
          type: "file",
          required: true,
          helperTextAr: "مطلوب في الواجهة. الرفع الفعلي يُفعَّل لاحقاً.",
        },
        {
          name: "equivalency_note",
          labelAr: "ملاحظة",
          type: "info",
          defaultValue: "مراجعة المعادلة واعتمادها تتم لاحقاً من رئيس القسم المختص.",
        },
      ],
    },
  ],
};

const OCTOBER_EXAM_ENTRY: RequestFormDefinition = {
  code: "october_exam_entry_form",
  titleAr: "استمارة دخول دور أكتوبر",
  descriptionAr:
    "التقدم لامتحانات دور أكتوبر للمقررات المتبقية لاستكمال الخطة الدراسية (المستوى الرابع، بحد أقصى 4 مقررات).",
  unavailableUntilSchemaApplied: P1_ATOMIC_SCHEMA_APPLIED,
  warnings: [
    "المقررات المعروضة تُحسب آلياً من الخطة الدراسية والنتائج المعتمدة، ويُعاد احتسابها عند الإرسال.",
    "السداد يتم في النظام المالي الجامعي، وتكتفي البوابة بتأكيد الإيرادات باستلام السداد.",
  ],
  sections: [
    {
      fields: [
        {
          name: "remaining_courses_summary",
          labelAr: "عدد المقررات المتبقية",
          type: "readonly",
        },
        {
          name: "remaining_courses",
          labelAr: "المقررات المتبقية المطلوبة",
          type: "multi_select",
          required: true,
          referenceResolverKey: "october_remaining_required_courses",
          helperTextAr: "تُعرض بأسماء المقررات المعتمدة، ولا يُدخل الطالب أي معرفات.",
        },
        {
          name: "registrar_note",
          labelAr: "ملاحظة",
          type: "info",
          defaultValue: "الكشف النهائي لدخول دور أكتوبر يُصدر من مسجل الكلية بعد تأكيد السداد.",
        },
      ],
    },
  ],
};

const REPLACEMENT_STUDENT_CARD: RequestFormDefinition = {
  code: "replacement_student_card",
  titleAr: "إصدار بطاقة بدل فاقد",
  descriptionAr: "طلب إصدار بطاقة جامعية بديلة عند فقد البطاقة الحالية.",
  unavailableUntilSchemaApplied: P1_ATOMIC_SCHEMA_APPLIED,
  warnings: [
    "لا يلزم إرفاق مستند عند تقديم الطلب.",
    "بعد اعتماد الطلب، يتم السداد وفق إجراءات النظام المالي الجامعي ثم تصدر البطاقة من شؤون الطلاب.",
  ],
  sections: [
    {
      titleAr: "بيانات الفقد",
      fields: [
        {
          name: "loss_reason",
          labelAr: "تفاصيل فقد البطاقة",
          type: "textarea",
          required: true,
          placeholderAr: "اذكر باختصار أين أو كيف فُقدت البطاقة",
          helperTextAr: "اكتب وصفاً واضحاً لا يقل عن 3 أحرف.",
        },
        {
          name: "loss_incident_date",
          labelAr: "تاريخ الفقد التقريبي",
          type: "date",
          required: true,
        },
        {
          name: "previous_card_serial",
          labelAr: "الرقم التسلسلي للبطاقة السابقة (إن كان معروفاً)",
          type: "text",
          placeholderAr: "اختياري",
        },
        {
          name: "loss_declaration_ack",
          labelAr: "أقرّ بصحة بيانات الفقد وأتحمل مسؤولية استخدامها",
          type: "checkbox",
          required: true,
        },
        {
          name: "issuance_note",
          labelAr: "ملاحظة",
          type: "info",
          defaultValue:
            "تُجلب هوية الطالب ورقمه وقسمه من الحساب تلقائياً، ولا حاجة لإعادة إدخالها في الطلب.",
        },
      ],
    },
  ],
};


const FINAL_CHANCE: RequestFormDefinition = {
  code: "final_chance",
  titleAr: "فرصة أخيرة",
  descriptionAr: "طلب فرصة نهائية لأداء الاختبار فقط، بعد التحقق الأكاديمي وتأكيد المالية الخارجي.",
  unavailableUntilSchemaApplied: SCHEMA_PENDING,
  warnings: ["السداد يتم في النظام الجامعي الأساسي، ولا تسجل البوابة مبلغاً أو عملة أو فاتورة."],
  sections: [{
    fields: [
      { name: "target_academic_year", labelAr: "العام الجامعي", type: "select", required: true, referenceResolverKey: "academic_years" },
      { name: "target_semester", labelAr: "الفصل الدراسي", type: "select", required: true, referenceResolverKey: "semesters_for_year", referenceDependsOnField: "target_academic_year" },
      { name: "reason", labelAr: "سبب طلب الفرصة النهائية", type: "textarea", required: true },
      { name: "chance_type", labelAr: "نوع الفرصة", type: "readonly", defaultValue: "final_chance" },
    ],
  }],
};

const FORM_BY_CANONICAL = new Map<string, RequestFormDefinition>([
  ["enrollment_suspension", ENROLLMENT_SUSPENSION],
  ["grade_statement_non_graduate", GRADE_STATEMENT_NON_GRADUATE],
  ["enrollment_certificate", ENROLLMENT_CERTIFICATE],
  ["file_withdrawal", FILE_WITHDRAWAL],
  ["excused_absence", EXCUSED_ABSENCE],
  ["grade_appeal", GRADE_APPEAL],
  ["department_transfer", DEPARTMENT_TRANSFER],
  ["final_chance", FINAL_CHANCE],
  ["october_exam_entry_form", OCTOBER_EXAM_ENTRY],
  ["replacement_student_card", REPLACEMENT_STUDENT_CARD],
]);

export const CANONICAL_FORM_CODES = [...FORM_BY_CANONICAL.keys()] as const;

export function getStudentRequestFormDefinition(
  code: string | null | undefined,
): RequestFormDefinition | undefined {
  const normalized = normalizeStudentRequestTypeCode(code);
  if (!normalized) return undefined;
  return FORM_BY_CANONICAL.get(normalized);
}

export function hasStudentRequestFormDefinition(code: string | null | undefined): boolean {
  return getStudentRequestFormDefinition(code) != null;
}

function fieldVisible(field: RequestFormFieldDefinition, values: Record<string, unknown>): boolean {
  if (!field.dependsOn) return true;
  const current = values[field.dependsOn.field];
  if (field.dependsOn.equals !== undefined) {
    return current === field.dependsOn.equals;
  }
  return Boolean(current);
}

export function getEmptyFormValues(def: RequestFormDefinition): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const section of def.sections) {
    for (const field of section.fields) {
      if (field.type === "info" || field.type === "readonly") continue;
      if (field.type === "checkbox") {
        values[field.name] = field.defaultValue ?? false;
      } else if (field.type === "multi_select") {
        values[field.name] = field.defaultValue ?? [];
      } else if (field.type === "file") {
        values[field.name] = null;
      } else {
        values[field.name] = field.defaultValue ?? "";
      }
    }
  }
  return values;
}

function isEmptyValue(field: RequestFormFieldDefinition, value: unknown): boolean {
  if (field.type === "checkbox") return value !== true;
  if (field.type === "multi_select") return !Array.isArray(value) || value.length === 0;
  if (field.type === "file") return value == null;
  if (typeof value === "string") return value.trim() === "";
  return value == null || value === "";
}

export function validateStudentRequestFormValues(
  def: RequestFormDefinition,
  values: Record<string, unknown>,
): { valid: boolean; missingLabels: string[]; missingFields: string[] } {
  const missingLabels: string[] = [];
  const missingFields: string[] = [];
  for (const section of def.sections) {
    for (const field of section.fields) {
      if (!field.required || field.type === "info" || field.type === "readonly") continue;
      if (!fieldVisible(field, values)) continue;
      if (isEmptyValue(field, values[field.name])) {
        missingLabels.push(field.labelAr);
        missingFields.push(field.name);
      }
    }
  }
  return { valid: missingLabels.length === 0, missingLabels, missingFields };
}

function formatFieldValue(field: RequestFormFieldDefinition, value: unknown): string {
  if (field.type === "checkbox") return value === true ? "نعم" : "لا";
  if (field.type === "file") {
    if (value instanceof File) return value.name;
    return value ? String(value) : "—";
  }
  if (field.type === "multi_select" && Array.isArray(value)) {
    const labels = value.map((v) => {
      const opt = field.options?.find((o) => o.value === v);
      return opt?.labelAr ?? String(v);
    });
    return labels.join("، ") || "—";
  }
  if (field.type === "select") {
    const opt = field.options?.find((o) => o.value === value);
    return opt?.labelAr ?? String(value ?? "—");
  }
  return String(value ?? "—");
}

/** Human-readable summary for description / student_notes (current save path). */
export function buildFormValuesSummary(
  def: RequestFormDefinition,
  values: Record<string, unknown>,
): string {
  const lines: string[] = [`نوع الطلب: ${def.titleAr}`];
  for (const section of def.sections) {
    if (section.titleAr) lines.push(`\n[${section.titleAr}]`);
    for (const field of section.fields) {
      if (field.type === "info" || field.type === "readonly") continue;
      if (!fieldVisible(field, values)) continue;
      lines.push(`${field.labelAr}: ${formatFieldValue(field, values[field.name])}`);
    }
  }
  return lines.join("\n");
}

/** Strip File objects for JSON form_data persistence. */
export function serializeFormValuesForStorage(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(values)) {
    if (val instanceof File) {
      out[key] = { _filePlaceholder: true, name: val.name, size: val.size };
    } else {
      out[key] = val;
    }
  }
  return out;
}
