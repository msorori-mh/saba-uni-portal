import { createFileRoute } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { importFacultyAccountsRows } from "@/lib/faculty-accounts.functions";
import {
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSpreadsheet,
  AlertTriangle,
  History,
  FileDown,
  FlaskConical,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  runBulkImport,
  getImportStats,
  listImportHistory,
  validateBulkImportPreview,
  getStudentImportContextOptions,
  getStudyPlanImportContextOptions,
} from "@/lib/imports.functions";
import {
  parseExcel,
  downloadTemplate,
  type StudentTemplateOverrides,
} from "@/lib/imports/templates";
import { auditImportStarted, auditImportValidated, auditImportFailed } from "@/lib/imports/engine";
import {
  isEligibilityReadOnlyDryRun,
  shouldSkipEligibilityClientLifecycleAudit,
} from "@/lib/imports/eligibility-import-policy";
import { downloadValidationReport, downloadImportReport } from "@/lib/imports/reports";
import {
  IMPORT_TYPE_LABEL_AR,
  IMPORT_LOG_STATUS_AR,
  getReportStatLabels,
} from "@/lib/imports/labels";
import type { ImportReport, ImportType, ValidationResult, ValidatedRow } from "@/lib/imports/types";
import { MasterTemplatesLibrary } from "@/components/admin/MasterTemplatesLibrary";
import { downloadMasterTemplate } from "@/lib/imports/master-templates";
import { ScheduleImportPanel } from "@/components/admin/ScheduleImportPanel";
import { CourseSyllabusImportPanel } from "@/components/admin/CourseSyllabusImportPanel";

export const Route = createFileRoute("/admin/imports")({
  head: () => ({
    meta: [
      { title: "الاستيراد الجماعي — لوحة الإدارة" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ImportsPage,
});

type TabId = ImportType | "faculty_accounts" | "class_schedule" | "course_syllabi";

const TABS: { id: TabId; label: string }[] = [
  { id: "students", label: "الطلاب" },
  { id: "faculty", label: "أعضاء هيئة التدريس" },
  { id: "staff", label: "الموظفون" },
  { id: "courses", label: "المقررات" },
  { id: "study_plans", label: "الخطط الدراسية" },
  { id: "departments", label: "الأقسام" },
  { id: "programs", label: "البرامج" },
  { id: "levels", label: "المستويات الدراسية" },
  { id: "course_sections", label: "مجموعات المقررات" },
  { id: "student_enrollments", label: "تسجيلات الطلاب" },
  { id: "student_grades", label: "درجات الطلاب" },
  { id: "student_academic_status", label: "الحالة الأكاديمية للطلاب" },
  { id: "student_eligibility", label: "بيانات أهلية الطلبات" },
  { id: "student_accounts", label: "حسابات الطلاب الموجودين" },
  { id: "student_fees", label: "رسوم الطلاب" },
  { id: "student_discounts", label: "خصومات الطلاب" },
  { id: "documents", label: "الوثائق الرسمية" },
  { id: "class_schedule", label: "الجداول الدراسية" },
  { id: "course_syllabi", label: "توصيف المقررات" },
  { id: "faculty_accounts", label: "حسابات أعضاء هيئة التدريس" },
];

const TYPE_LABEL = IMPORT_TYPE_LABEL_AR;

const IMPORT_TAB_INFO: Partial<Record<ImportType, { description: string; warning: string }>> = {
  student_eligibility: {
    description:
      "تحديث بيانات أهلية الطلبات للطلاب الموجودين من كشف رسمي معتمد. لا ينشئ طلابًا أو حسابات دخول.",
    warning:
      "هذه البيانات تؤثر مستقبلاً في قبول أو رفض طلبات الطلاب. يجب استخدام ملف رسمي معتمد ومراجعة نتيجة التحقق قبل التنفيذ.",
  },
  student_accounts: {
    description:
      "إنشاء حسابات دخول بالإيميل الجامعي للطلاب الموجودين مسبقاً في النظام. لا ينشئ ملفات طلاب ولا يعدّل القسم/البرنامج/المستوى/السنة/الفصل/الحالة الأكاديمية.",
    warning:
      "يتطلب صلاحية مدير النظام. نفّذ معاينة ثم تجريبياً قبل التنفيذ. عند CONFLICT لا يتم أي ربط تلقائي. لا تُعرض كلمات المرور في التقارير.",
  },
  student_academic_status: {
    description:
      "ترحيل/تحديث الحالة الأكاديمية للطلاب (المستوى وحالة القيد) لفصل دراسي محدد ضمن سنة أكاديمية محددة. لا ينشئ طلابًا ولا يغيّر بياناتهم الأساسية.",
    warning:
      "تُكتب الحالة لكل طالب/سنة/فصل بدفعة ذرّية واحدة: إن فشلت الدفعة لا يُدرَج أو يُحدَّث أي صف. فعّل «تحديث القائم» فقط عند قصد تحديث سجلات موجودة لنفس الفصل.",
  },
};

const STRUCTURE_TYPES = new Set<ImportType>([
  "departments",
  "programs",
  "levels",
  "course_sections",
  "student_enrollments",
  "student_grades",
  "student_academic_status",
  "student_fees",
  "student_discounts",
]);

const STEPS = ["تنزيل القالب", "رفع الملف", "المعاينة", "التحقق", "الاستيراد", "التقرير"] as const;

const SERVER_PREVIEW_ERROR =
  "تعذر تنفيذ التحقق على الخادم. يرجى المحاولة مرة أخرى أو التواصل مع مدير النظام.";

const STUDENT_CONTEXT_REQUIRED_MESSAGE = "يرجى إكمال إعدادات قالب الطلاب قبل التنزيل.";
const STUDENT_CONTEXT_PARTIAL_MESSAGE =
  "يرجى إكمال إعدادات قالب الطلاب قبل رفع الملف أو امسح الاختيارات للمتابعة بالقالب العام.";
const STUDY_PLAN_CONTEXT_REQUIRED_MESSAGE = "يرجى إكمال إعدادات سياق الخطة الدراسية قبل المتابعة.";

const STUDENT_CONTEXT_MISMATCH_MESSAGES = {
  study_system: "قيمة نظام الدراسة في الملف لا تطابق نظام الدراسة المحدد في إعدادات الاستيراد.",
  department_code: "قيمة القسم في الملف لا تطابق القسم المحدد في إعدادات الاستيراد.",
  program_code: "قيمة البرنامج في الملف لا تطابق البرنامج المحدد في إعدادات الاستيراد.",
  academic_level: "قيمة المستوى في الملف لا تطابق المستوى المحدد في إعدادات الاستيراد.",
  academic_year: "قيمة العام الجامعي في الملف لا تطابق العام المحدد في إعدادات الاستيراد.",
  semester: "قيمة الفصل في الملف لا تطابق الفصل المحدد في إعدادات الاستيراد.",
} as const;

const STUDY_SYSTEM_FILENAME_PART: Record<string, string> = {
  regular: "regular",
  private: "parallel",
};

type StudyPlanImportContextState = {
  departmentId: string;
  programId: string;
  planName: string;
  version: string;
  planStatus: "draft" | "active";
  importMode: "full_plan" | "single_semester" | "";
  semesterCode: "first" | "second" | "";
};

type StudentImportContextState = {
  studySystem: string;
  departmentId: string;
  programId: string;
  levelId: string;
  academicYearId: string;
  semesterId: string;
};

type StudentImportContextOptions = {
  studySystems: Array<{ value: string; label: string }>;
  departments: Array<{ id?: string; code?: string; name: string; study_system?: string | null }>;
  programs: Array<{
    id?: string;
    code?: string;
    name: string;
    department_id?: string | null;
    department_code?: string | null;
    study_system?: string | null;
  }>;
  levels: Array<{ id?: string; code?: string; name?: string; level_number?: number }>;
  academicYears: Array<{ id?: string; name: string; is_current?: boolean }>;
  semesters: Array<{
    id?: string;
    name: string;
    code?: string;
    academic_year_id?: string | null;
    is_current?: boolean;
  }>;
};

type StudyPlanImportContextOptions = {
  departments: Array<{ id: string; name_ar: string }>;
  programs: Array<{ id: string; code: string; name_ar: string; department_id: string | null }>;
  levels: Array<{ id: string; name: string; level_number: number }>;
  academicYears: Array<{ id: string; name: string; is_current?: boolean }>;
  semesters: Array<{
    id: string;
    name: string;
    code: string;
    academic_year_id?: string | null;
    is_current?: boolean;
  }>;
  studyPlans: Array<{
    id: string;
    name: string;
    version: string;
    program_id: string;
    status: string;
    is_active: boolean;
  }>;
};

const EMPTY_STUDENT_IMPORT_CONTEXT: StudentImportContextState = {
  studySystem: "",
  departmentId: "",
  programId: "",
  levelId: "",
  academicYearId: "",
  semesterId: "",
};

const EMPTY_STUDY_PLAN_IMPORT_CONTEXT: StudyPlanImportContextState = {
  departmentId: "",
  programId: "",
  planName: "",
  version: "1.0",
  planStatus: "active",
  importMode: "",
  semesterCode: "",
};

const cellText = (value: unknown) => (value == null ? "" : String(value).trim());
const compareKey = (value: unknown) => cellText(value).toLowerCase();
const normalizeStudySystemCell = (value: unknown) => {
  const key = compareKey(value);
  if (key === "regular" || key === "عام" || key === "نظام عام" || key === "general")
    return "regular";
  if (
    key === "private" ||
    key === "نفقة خاصة" ||
    key === "نظام نفقة خاصة" ||
    key === "private_expense"
  )
    return "private";
  return cellText(value);
};

function sanitizeFileNamePart(value: unknown, fallback: string) {
  const sanitized = cellText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return sanitized || fallback;
}

function studentTemplateFileName(overrides: StudentTemplateOverrides) {
  const program = sanitizeFileNamePart(overrides.program_code, "program");
  const level = sanitizeFileNamePart(overrides.academic_level, "level");
  const studySystem =
    STUDY_SYSTEM_FILENAME_PART[overrides.study_system || ""] ||
    sanitizeFileNamePart(overrides.study_system, "study_system");
  const academicYear = sanitizeFileNamePart(overrides.academic_year, "year");
  const semester = sanitizeFileNamePart(overrides.semester, "semester");
  return `students_${program}_level_${level}_${studySystem}_${academicYear}_${semester}.xlsx`;
}

function hasAnyStudentImportContextValue(context: StudentImportContextState) {
  return Object.values(context).some(Boolean);
}

function isStudentContextClientError(message: string) {
  return (
    message === STUDENT_CONTEXT_REQUIRED_MESSAGE ||
    message === STUDENT_CONTEXT_PARTIAL_MESSAGE ||
    Object.values(STUDENT_CONTEXT_MISMATCH_MESSAGES).includes(
      message as (typeof STUDENT_CONTEXT_MISMATCH_MESSAGES)[keyof typeof STUDENT_CONTEXT_MISMATCH_MESSAGES],
    )
  );
}

function resolveStudentTemplateOverrides(
  context: StudentImportContextState,
  options?: StudentImportContextOptions,
): StudentTemplateOverrides | null {
  if (!options) return null;
  const department = options.departments.find((item) => item.id === context.departmentId);
  const program = options.programs.find((item) => item.id === context.programId);
  const level = options.levels.find((item) => item.id === context.levelId);
  const academicYear = options.academicYears.find((item) => item.id === context.academicYearId);
  const semester = options.semesters.find((item) => item.id === context.semesterId);
  if (!department || !program || !level || !academicYear || !semester) return null;

  const academicLevel =
    level.level_number != null ? String(level.level_number) : level.code || level.name || "";

  return {
    study_system: context.studySystem,
    department_code: department.code || department.name,
    program_code: program.code || "",
    academic_level: academicLevel,
    academic_year: academicYear.name,
    semester: semester.code || semester.name,
  };
}

function applyStudentContextToRows(
  rows: Record<string, unknown>[],
  context: StudentTemplateOverrides,
): Record<string, unknown>[] {
  const specs: Array<{
    column: keyof typeof STUDENT_CONTEXT_MISMATCH_MESSAGES;
    value: string | undefined;
    message: string;
  }> = [
    {
      column: "study_system",
      value: context.study_system,
      message: STUDENT_CONTEXT_MISMATCH_MESSAGES.study_system,
    },
    {
      column: "department_code",
      value: context.department_code,
      message: STUDENT_CONTEXT_MISMATCH_MESSAGES.department_code,
    },
    {
      column: "program_code",
      value: context.program_code,
      message: STUDENT_CONTEXT_MISMATCH_MESSAGES.program_code,
    },
    {
      column: "academic_level",
      value: context.academic_level,
      message: STUDENT_CONTEXT_MISMATCH_MESSAGES.academic_level,
    },
    {
      column: "academic_year",
      value: context.academic_year,
      message: STUDENT_CONTEXT_MISMATCH_MESSAGES.academic_year,
    },
    {
      column: "semester",
      value: context.semester,
      message: STUDENT_CONTEXT_MISMATCH_MESSAGES.semester,
    },
  ];

  return rows.map((row) => {
    const next = { ...row };
    specs.forEach(({ column, value, message }) => {
      if (!value) return;
      const existing = cellText(next[column]);
      if (!existing) {
        next[column] = value;
        return;
      }
      const existingComparable =
        column === "study_system" ? normalizeStudySystemCell(existing) : compareKey(existing);
      const valueComparable =
        column === "study_system" ? normalizeStudySystemCell(value) : compareKey(value);
      if (existingComparable !== valueComparable) {
        throw new Error(message);
      }
      if (column === "study_system") next[column] = valueComparable;
    });
    return next;
  });
}

function hasAnyStudyPlanContextValue(context: StudyPlanImportContextState) {
  return Boolean(
    context.departmentId ||
    context.programId ||
    context.planName.trim() ||
    context.version.trim() ||
    context.importMode ||
    context.semesterCode,
  );
}

function studyPlanContextReady(context: StudyPlanImportContextState) {
  return Boolean(
    context.departmentId &&
    context.programId &&
    context.planName.trim() &&
    context.version.trim() &&
    context.importMode &&
    (context.importMode !== "single_semester" || context.semesterCode),
  );
}

function studyPlanContextPayload(context: StudyPlanImportContextState) {
  if (!studyPlanContextReady(context)) return undefined;
  return {
    departmentId: context.departmentId,
    programId: context.programId,
    planName: context.planName.trim(),
    version: context.version.trim(),
    planStatus: context.planStatus,
    importMode: context.importMode as "full_plan" | "single_semester",
    semesterCode: context.importMode === "single_semester" ? context.semesterCode : null,
  };
}

function applyStudyPlanContextToRows(
  rows: Record<string, unknown>[],
  context: StudyPlanImportContextState,
  options?: StudyPlanImportContextOptions,
): Record<string, unknown>[] {
  if (!studyPlanContextReady(context)) throw new Error(STUDY_PLAN_CONTEXT_REQUIRED_MESSAGE);
  const program = options?.programs.find((item) => item.id === context.programId);
  if (!program) throw new Error("البرنامج المختار غير موجود.");
  if (program.department_id !== context.departmentId)
    throw new Error("البرنامج المختار لا يتبع القسم المحدد.");
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const next = { ...row };
    const programCode = cellText(next.program_code);
    if (programCode && compareKey(programCode) !== compareKey(program.code)) {
      throw new Error(`صف ${rowNumber}: البرنامج داخل الملف لا يطابق البرنامج المختار من الشاشة.`);
    }
    next.program_code = program.code;
    next.plan_name = context.planName.trim();
    next.version = context.version.trim();
    next.plan_status = context.planStatus;

    if (context.importMode === "full_plan") {
      if (!cellText(next.level))
        throw new Error(`صف ${rowNumber}: يجب إدخال المستوى عند استيراد خطة كاملة.`);
      if (!cellText(next.semester))
        throw new Error(`صف ${rowNumber}: يجب إدخال الفصل الدراسي عند استيراد خطة كاملة.`);
    } else {
      const fileSemester = cellText(next.semester);
      if (fileSemester && compareKey(fileSemester) !== compareKey(context.semesterCode)) {
        throw new Error(
          `صف ${rowNumber}: الفصل الدراسي داخل الملف لا يطابق الفصل المحدد في إعدادات الاستيراد.`,
        );
      }
      next.semester = context.semesterCode;
    }
    return next;
  });
}

function ImportsPage() {
  usePagePerf("/admin/imports");
  const runBulkImportFn = useServerFn(runBulkImport);
  const previewFn = useServerFn(validateBulkImportPreview);
  const studentContextOptionsFn = useServerFn(getStudentImportContextOptions);
  const studyPlanContextOptionsFn = useServerFn(getStudyPlanImportContextOptions);
  const [tab, setTab] = useState<TabId>("students");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [validation, setValidation] = useState<ValidationResult<any> | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [dryRunCompleted, setDryRunCompleted] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [perfMs, setPerfMs] = useState<number | null>(null);
  const [studentImportContext, setStudentImportContext] = useState<StudentImportContextState>(
    EMPTY_STUDENT_IMPORT_CONTEXT,
  );
  const [studyPlanImportContext, setStudyPlanImportContext] = useState<StudyPlanImportContextState>(
    EMPTY_STUDY_PLAN_IMPORT_CONTEXT,
  );
  const qc = useQueryClient();

  const { data: rawStudentContextOptions, isLoading: studentContextOptionsLoading } = useQuery({
    queryKey: ["student-import-context-options"],
    queryFn: () => studentContextOptionsFn({ data: {} }),
    enabled: tab === "students",
  });
  const studentContextOptions = rawStudentContextOptions as StudentImportContextOptions | undefined;
  const { data: rawStudyPlanContextOptions, isLoading: studyPlanContextOptionsLoading } = useQuery({
    queryKey: ["study-plan-import-context-options"],
    queryFn: () => studyPlanContextOptionsFn({ data: {} }),
    enabled: tab === "study_plans",
  });
  const studyPlanContextOptions = rawStudyPlanContextOptions as
    | StudyPlanImportContextOptions
    | undefined;

  const reset = () => {
    setFile(null);
    setRows(null);
    setValidation(null);
    setReport(null);
    setPerfMs(null);
    setDryRunCompleted(false);
  };

  const onTabChange = (t: TabId) => {
    setTab(t);
    reset();
    setUpdateExisting(false);
    setDryRun(false);
  };

  // Determine current step (0..5)
  const step = useMemo(() => {
    if (report) return 5;
    if (importing) return 4;
    if (validation) return 3;
    if (rows) return 2;
    if (file) return 1;
    return 0;
  }, [report, importing, validation, rows, file]);

  const isSpecialTab = tab === "faculty_accounts" || tab === "class_schedule";
  const isStructureTab = !isSpecialTab && STRUCTURE_TYPES.has(tab as ImportType);
  const isStudyPlanContextReady = studyPlanContextReady(studyPlanImportContext);
  const selectedStudyPlanProgram = studyPlanContextOptions?.programs.find(
    (program) => program.id === studyPlanImportContext.programId,
  );
  const existingStudyPlanConflict = Boolean(
    studyPlanImportContext.programId &&
    studyPlanImportContext.version.trim() &&
    studyPlanContextOptions?.studyPlans.some(
      (plan) =>
        plan.program_id === studyPlanImportContext.programId &&
        compareKey(plan.version) === compareKey(studyPlanImportContext.version),
    ),
  );
  const studentTemplateOverrides = useMemo(
    () => resolveStudentTemplateOverrides(studentImportContext, studentContextOptions),
    [studentImportContext, studentContextOptions],
  );
  const studentContextReady = Boolean(
    studentImportContext.studySystem &&
    studentImportContext.departmentId &&
    studentImportContext.programId &&
    studentImportContext.levelId &&
    studentImportContext.academicYearId &&
    studentImportContext.semesterId &&
    studentTemplateOverrides,
  );

  const runServerPreview = async (
    parsed: Record<string, unknown>[],
    updateExistingFlag: boolean,
  ): Promise<ValidationResult<unknown>> => {
    try {
      return await previewFn({
        data: {
          type: tab as ImportType,
          rows: parsed,
          updateExisting: updateExistingFlag,
          studyPlanContext:
            tab === "study_plans" ? studyPlanContextPayload(studyPlanImportContext) : undefined,
        },
      });
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (/صلاحية|Unauthorized/i.test(msg)) throw e;
      throw new Error(SERVER_PREVIEW_ERROR);
    }
  };

  const updateStudentImportContext = (next: StudentImportContextState) => {
    setStudentImportContext(next);
    reset();
  };

  const updateStudyPlanImportContext = (next: StudyPlanImportContextState) => {
    setStudyPlanImportContext(next);
    reset();
  };

  const downloadCustomStudentTemplate = () => {
    if (!studentContextReady || !studentTemplateOverrides) {
      alert(STUDENT_CONTEXT_REQUIRED_MESSAGE);
      return;
    }
    void downloadTemplate("students", studentTemplateOverrides, {
      fileName: studentTemplateFileName(studentTemplateOverrides),
    });
  };

  const prepareRowsForPreview = (parsed: Record<string, unknown>[]) => {
    if (tab !== "students") return parsed;
    if (!hasAnyStudentImportContextValue(studentImportContext)) return parsed;
    if (!studentContextReady || !studentTemplateOverrides) {
      throw new Error(STUDENT_CONTEXT_PARTIAL_MESSAGE);
    }
    return applyStudentContextToRows(parsed, studentTemplateOverrides);
  };

  const prepareParsedRowsForPreview = (parsed: Record<string, unknown>[]) => {
    if (tab === "students") return prepareRowsForPreview(parsed);
    if (tab === "study_plans") {
      if (!hasAnyStudyPlanContextValue(studyPlanImportContext) || !isStudyPlanContextReady) {
        throw new Error(STUDY_PLAN_CONTEXT_REQUIRED_MESSAGE);
      }
      if (existingStudyPlanConflict) throw new Error("توجد خطة مسبقاً لهذا البرنامج والإصدار.");
      return applyStudyPlanContextToRows(parsed, studyPlanImportContext, studyPlanContextOptions);
    }
    return parsed;
  };

  const onFile = async (f: File) => {
    if (isSpecialTab) return;
    const t = tab as ImportType;
    setFile(f);
    setRows(null);
    setValidation(null);
    setReport(null);
    setPerfMs(null);
    setValidating(true);
    try {
      const parsed = await parseExcel(f);
      const rowsForPreview = prepareParsedRowsForPreview(parsed);
      setRows(rowsForPreview);
      const res = await runServerPreview(rowsForPreview, updateExisting);
      setValidation(res);
      if (!shouldSkipEligibilityClientLifecycleAudit(t)) {
        void auditImportValidated(t, f.name, {
          total: res.totalRows,
          valid: res.validRows,
          invalid: res.invalidRows,
        });
      }
    } catch (e) {
      if (!shouldSkipEligibilityClientLifecycleAudit(t)) {
        void auditImportFailed(t, f.name, (e as Error).message);
      }
      const msg = (e as Error).message;
      alert(
        isStudentContextClientError(msg) ||
          msg === SERVER_PREVIEW_ERROR ||
          /صلاحية|Unauthorized/i.test(msg)
          ? msg
          : "تعذر قراءة الملف: " + msg,
      );
    } finally {
      setValidating(false);
    }
  };

  // Re-run validation when toggling Update Existing on structure tabs
  const onToggleUpdateExisting = async (next: boolean) => {
    setUpdateExisting(next);
    setDryRunCompleted(false);
    setReport(null);
    if (!rows || !isStructureTab) return;
    setValidating(true);
    try {
      const res = await runServerPreview(rows, next);
      setValidation(res);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setValidating(false);
    }
  };

  const runImport = async () => {
    if (!validation || !file) return;
    if (isSpecialTab) return;
    const t = tab as ImportType;
    setImporting(true);
    setReport(null);
    setPerfMs(null);
    const t0 = performance.now();
    try {
      if (!isEligibilityReadOnlyDryRun(t, dryRun)) {
        void auditImportStarted(t, file.name, validation.totalRows, dryRun);
      }
      const rep = await runBulkImportFn({
        data: {
          type: t,
          fileName: file.name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows: validation.rows as any[],
          dryRun,
          updateExisting,
          studyPlanContext:
            t === "study_plans" ? studyPlanContextPayload(studyPlanImportContext) : undefined,
        },
      });
      const duration = Math.round(performance.now() - t0);
      setPerfMs(duration);
      setReport(rep);
      if (dryRun) setDryRunCompleted(true);
      qc.invalidateQueries({ queryKey: ["import-history"] });
      qc.invalidateQueries({ queryKey: ["import-stats"] });
    } catch (e) {
      if (!isEligibilityReadOnlyDryRun(t, dryRun)) {
        void auditImportFailed(t, file.name, (e as Error).message);
      }
      alert("فشل الاستيراد: " + (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-extrabold text-primary flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-gold" /> الاستيراد الجماعي
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          استورد بيانات حقيقية من ملفات Excel مع التحقق المسبق، الوضع التجريبي، وتقارير قابلة
          للتنزيل.
        </p>
      </header>

      <ImportStats />

      <Stepper current={step} />

      <div className="space-y-2">
        <div className="flex items-start gap-2 rounded-lg bg-secondary/40 border border-border px-3 py-2 text-xs text-primary">
          <AlertTriangle className="h-4 w-4 text-gold shrink-0 mt-0.5" />
          <span>
            الأنواع الظاهرة في التبويبات أدناه هي <strong>المستوردات المتاحة فعلياً</strong> للرفع
            والاستيراد. بعض القوالب الإضافية متاحة للتنزيل من قسم «قوالب الاستيراد الرسمية» في
            الأسفل.
          </span>
        </div>
        <nav className="flex flex-wrap gap-2 border-b border-border">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onTabChange(t.id)}
                className={`relative px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-all ${
                  active
                    ? "border-gold text-primary bg-gold/10 shadow-[0_-4px_12px_-4px_var(--gold)]"
                    : "border-transparent text-muted-foreground hover:text-primary hover:bg-muted/40"
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 bg-gold rounded-full" />
                )}
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === "faculty_accounts" ? (
        <FacultyAccountsImportPanel />
      ) : tab === "class_schedule" ? (
        <ScheduleImportPanel />
      ) : tab === "course_syllabi" ? (
        <CourseSyllabusImportPanel />
      ) : (
        <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
          {IMPORT_TAB_INFO[tab as ImportType] && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {IMPORT_TAB_INFO[tab as ImportType]!.description}
              </p>
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{IMPORT_TAB_INFO[tab as ImportType]!.warning}</span>
              </div>
            </div>
          )}
          {tab === "students" && (
            <StudentImportContextWizard
              options={studentContextOptions}
              value={studentImportContext}
              isLoading={studentContextOptionsLoading}
              isReady={studentContextReady}
              onChange={updateStudentImportContext}
              onDownload={downloadCustomStudentTemplate}
            />
          )}
          {tab === "study_plans" && (
            <StudyPlanImportContextWizard
              options={studyPlanContextOptions}
              value={studyPlanImportContext}
              isLoading={studyPlanContextOptionsLoading}
              isReady={isStudyPlanContextReady && !existingStudyPlanConflict}
              existingPlanConflict={existingStudyPlanConflict}
              onChange={updateStudyPlanImportContext}
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => downloadTemplate(tab as ImportType)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-primary hover:border-gold"
            >
              <Download className="h-4 w-4" />{" "}
              {tab === "students" ? "تنزيل القالب العام" : "تنزيل القالب"}
            </button>

            <label className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground cursor-pointer hover:opacity-90">
              <Upload className="h-4 w-4" />
              رفع ملف Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </label>

            {file && (
              <span className="text-xs text-muted-foreground">
                الملف: <span className="font-mono">{file.name}</span>
              </span>
            )}

            {validation && (
              <button
                onClick={() =>
                  downloadValidationReport(tab as ImportType, file?.name ?? "file.xlsx", validation)
                }
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-primary hover:border-gold"
              >
                <FileDown className="h-3.5 w-3.5" /> تقرير التحقق
              </button>
            )}

            {validation && !report && (
              <div className="ml-auto flex flex-col items-end gap-2">
                {!dryRun && !dryRunCompleted && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 max-w-md text-right">
                    <strong>خطوة مطلوبة:</strong> شغّل <strong>الوضع التجريبي (Dry Run)</strong> مرة
                    واحدة قبل التنفيذ الفعلي للتأكد من النتائج المتوقعة.
                  </div>
                )}
                {dryRunCompleted && !dryRun && (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    <CheckCircle2 className="inline h-3.5 w-3.5 ml-1" />
                    اكتمل التشغيل التجريبي — يمكنك تنفيذ الاستيراد الفعلي الآن.
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  {isStructureTab && (
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-gold"
                        checked={updateExisting}
                        onChange={(e) => onToggleUpdateExisting(e.target.checked)}
                      />
                      تحديث القائم (Update Existing)
                    </label>
                  )}
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-primary cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-gold"
                      checked={dryRun}
                      onChange={(e) => setDryRun(e.target.checked)}
                    />
                    <FlaskConical className="h-3.5 w-3.5 text-gold" /> وضع التحقق فقط (Dry Run)
                  </label>
                  <button
                    onClick={runImport}
                    disabled={
                      importing || validation.validRows === 0 || (!dryRun && !dryRunCompleted)
                    }
                    title={!dryRun && !dryRunCompleted ? "شغّل الوضع التجريبي أولاً" : undefined}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
                      dryRun ? "bg-amber-600" : "bg-emerald-600"
                    }`}
                  >
                    {importing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {dryRun ? "تشغيل تجريبي" : "تنفيذ الاستيراد"} ({validation.validRows} صف)
                  </button>
                </div>
              </div>
            )}
          </div>

          {validating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحقق من البيانات...
            </div>
          )}

          {validation && (
            <>
              {tab === "study_plans" && (
                <StudyPlanPreviewSummary
                  context={studyPlanImportContext}
                  departmentName={
                    studyPlanContextOptions?.departments.find(
                      (d) => d.id === studyPlanImportContext.departmentId,
                    )?.name_ar
                  }
                  programLabel={
                    selectedStudyPlanProgram
                      ? `${selectedStudyPlanProgram.name_ar} (${selectedStudyPlanProgram.code})`
                      : undefined
                  }
                  validation={validation}
                />
              )}
              <PreviewBlock validation={validation} />
            </>
          )}

          {report && (
            <ReportBlock
              report={report}
              type={tab as ImportType}
              dryRun={dryRun}
              durationMs={perfMs}
              onDownload={() =>
                downloadImportReport(tab as ImportType, file?.name ?? "file.xlsx", report, {
                  dryRun,
                  durationMs: perfMs,
                })
              }
              onContinueRealImport={
                dryRun
                  ? () => {
                      setReport(null);
                      setDryRun(false);
                    }
                  : undefined
              }
              onStartOver={() => reset()}
            />
          )}
        </section>
      )}

      <MasterTemplatesLibrary />

      <ImportHistory />
    </div>
  );
}

type StudentSelectOption = { value: string; label: string };

function StudentImportContextWizard({
  options,
  value,
  isLoading,
  isReady,
  onChange,
  onDownload,
}: {
  options?: StudentImportContextOptions;
  value: StudentImportContextState;
  isLoading: boolean;
  isReady: boolean;
  onChange: (next: StudentImportContextState) => void;
  onDownload: () => void;
}) {
  const studySystems = options?.studySystems ?? [];
  const departments = options?.departments ?? [];
  const programs = options?.programs ?? [];
  const levels = options?.levels ?? [];
  const academicYears = options?.academicYears ?? [];

  const filteredDepartments = useMemo(
    () =>
      departments.filter(
        (department) => !department.study_system || department.study_system === value.studySystem,
      ),
    [departments, value.studySystem],
  );

  const selectedDepartment = departments.find((department) => department.id === value.departmentId);

  const filteredPrograms = useMemo(() => {
    if (!selectedDepartment) return [];
    return programs.filter((program) => {
      const matchesDepartmentId = Boolean(
        selectedDepartment.id && program.department_id === selectedDepartment.id,
      );
      const selectedDepartmentCode = selectedDepartment.code || selectedDepartment.name;
      const matchesDepartmentCode = Boolean(
        program.department_code &&
        selectedDepartmentCode &&
        compareKey(program.department_code) === compareKey(selectedDepartmentCode),
      );
      const matchesStudySystem =
        !program.study_system || program.study_system === value.studySystem;
      return matchesStudySystem && (matchesDepartmentId || matchesDepartmentCode);
    });
  }, [programs, selectedDepartment, value.studySystem]);

  const filteredSemesters = useMemo(() => {
    const semesters = options?.semesters ?? [];
    if (!value.academicYearId) return [];
    return semesters.filter(
      (semester) =>
        !semester.academic_year_id || semester.academic_year_id === value.academicYearId,
    );
  }, [options?.semesters, value.academicYearId]);

  const setStudySystem = (studySystem: string) => {
    onChange({
      ...EMPTY_STUDENT_IMPORT_CONTEXT,
      studySystem,
    });
  };

  const setDepartment = (departmentId: string) => {
    onChange({
      ...EMPTY_STUDENT_IMPORT_CONTEXT,
      studySystem: value.studySystem,
      departmentId,
    });
  };

  const setProgram = (programId: string) => {
    onChange({
      ...EMPTY_STUDENT_IMPORT_CONTEXT,
      studySystem: value.studySystem,
      departmentId: value.departmentId,
      programId,
    });
  };

  const setLevel = (levelId: string) => {
    onChange({
      ...EMPTY_STUDENT_IMPORT_CONTEXT,
      studySystem: value.studySystem,
      departmentId: value.departmentId,
      programId: value.programId,
      levelId,
    });
  };

  const setAcademicYear = (academicYearId: string) => {
    onChange({
      ...EMPTY_STUDENT_IMPORT_CONTEXT,
      studySystem: value.studySystem,
      departmentId: value.departmentId,
      programId: value.programId,
      levelId: value.levelId,
      academicYearId,
    });
  };

  const setSemester = (semesterId: string) => {
    onChange({
      ...value,
      semesterId,
    });
  };

  return (
    <div className="rounded-xl border border-gold/40 bg-gold/5 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-extrabold text-primary">
            إعداد قالب بيانات الطلاب
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            اختر سياق الاستيراد من بيانات النظام لتجهيز القالب بالقسم والبرنامج والمستوى والعام
            والفصل الصحيحين.
          </p>
        </div>
        {isLoading && (
          <span className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> تحميل الخيارات...
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StudentContextSelect
          label="1. نوع نظام الدراسة"
          value={value.studySystem}
          onChange={setStudySystem}
          options={studySystems.map((system) => ({ value: system.value, label: system.label }))}
          disabled={isLoading}
          placeholder="اختر نظام الدراسة"
        />
        <StudentContextSelect
          label="2. القسم"
          value={value.departmentId}
          onChange={setDepartment}
          options={filteredDepartments.map((department) => ({
            value: department.id || department.name,
            label: department.name,
          }))}
          disabled={isLoading || !value.studySystem}
          placeholder="اختر القسم"
        />
        <StudentContextSelect
          label="3. البرنامج"
          value={value.programId}
          onChange={setProgram}
          options={filteredPrograms.map((program) => ({
            value: program.id || program.code || program.name,
            label: program.code ? `${program.name} (${program.code})` : program.name,
          }))}
          disabled={isLoading || !value.departmentId}
          placeholder="اختر البرنامج"
        />
        <StudentContextSelect
          label="4. المستوى"
          value={value.levelId}
          onChange={setLevel}
          options={levels.map((level) => ({
            value: level.id || level.code || String(level.level_number ?? level.name ?? ""),
            label: `${level.name ?? "المستوى"}${level.level_number != null ? ` — ${level.level_number}` : ""}`,
          }))}
          disabled={isLoading || !value.programId}
          placeholder="اختر المستوى"
        />
        <StudentContextSelect
          label="5. العام الجامعي"
          value={value.academicYearId}
          onChange={setAcademicYear}
          options={academicYears.map((year) => ({
            value: year.id || year.name,
            label: year.is_current ? `${year.name} — الحالي` : year.name,
          }))}
          disabled={isLoading || !value.levelId}
          placeholder="اختر العام الجامعي"
        />
        <StudentContextSelect
          label="6. الفصل الدراسي"
          value={value.semesterId}
          onChange={setSemester}
          options={filteredSemesters.map((semester) => ({
            value: semester.id || semester.code || semester.name,
            label: semester.code ? `${semester.name} (${semester.code})` : semester.name,
          }))}
          disabled={isLoading || !value.academicYearId}
          placeholder="اختر الفصل الدراسي"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-gold/30 pt-3">
        <button
          type="button"
          onClick={onDownload}
          aria-disabled={!isReady}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white ${
            isReady ? "bg-primary hover:opacity-90" : "bg-muted text-muted-foreground"
          }`}
        >
          <Download className="h-4 w-4" /> تنزيل قالب الطلاب المخصص
        </button>
        {!isReady && (
          <span className="text-xs text-muted-foreground">
            يرجى إكمال الاختيارات بالترتيب قبل تنزيل القالب المخصص.
          </span>
        )}
        {value.departmentId && filteredPrograms.length === 0 && (
          <span className="text-xs font-bold text-destructive">
            لا توجد برامج مرتبطة بالقسم المحدد.
          </span>
        )}
      </div>
    </div>
  );
}

function StudentContextSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: StudentSelectOption[];
  disabled?: boolean;
  placeholder: string;
}) {
  return (
    <label className="space-y-1 text-xs font-bold text-primary">
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-primary disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StudyPlanImportContextWizard({
  options,
  value,
  isLoading,
  isReady,
  existingPlanConflict,
  onChange,
}: {
  options?: StudyPlanImportContextOptions;
  value: StudyPlanImportContextState;
  isLoading: boolean;
  isReady: boolean;
  existingPlanConflict: boolean;
  onChange: (next: StudyPlanImportContextState) => void;
}) {
  const departments = options?.departments ?? [];
  const programs = options?.programs ?? [];
  const filteredPrograms = value.departmentId
    ? programs.filter((program) => program.department_id === value.departmentId)
    : [];

  const set = (patch: Partial<StudyPlanImportContextState>) => onChange({ ...value, ...patch });

  return (
    <div className="rounded-xl border border-gold/40 bg-gold/5 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-extrabold text-primary">
            إعداد سياق الخطة الدراسية
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            اختر القسم والبرنامج والخطة قبل رفع ملف Excel. القسم والبرنامج يحددان من الشاشة ولا
            يُكتبان داخل الملف.
          </p>
        </div>
        {isLoading && <span className="text-xs text-muted-foreground">جارٍ تحميل الخيارات...</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StudentContextSelect
          label="القسم"
          value={value.departmentId}
          onChange={(departmentId) => set({ departmentId, programId: "" })}
          options={departments.map((department) => ({
            value: department.id,
            label: department.name_ar,
          }))}
          disabled={isLoading}
          placeholder="اختر القسم"
        />
        <StudentContextSelect
          label="البرنامج"
          value={value.programId}
          onChange={(programId) => set({ programId })}
          options={filteredPrograms.map((program) => ({
            value: program.id,
            label: `${program.name_ar} (${program.code})`,
          }))}
          disabled={isLoading || !value.departmentId}
          placeholder="اختر البرنامج"
        />
        <StudentContextSelect
          label="حالة الخطة"
          value={value.planStatus}
          onChange={(planStatus) => set({ planStatus: planStatus as "draft" | "active" })}
          options={[
            { value: "active", label: "نشطة" },
            { value: "draft", label: "مسودة" },
          ]}
          disabled={isLoading}
          placeholder="اختر الحالة"
        />
        <label className="space-y-1 text-xs font-bold text-primary">
          <span>اسم الخطة</span>
          <input
            value={value.planName}
            onChange={(event) => set({ planName: event.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="مثال: خطة بكالوريوس تكنولوجيا المعلومات"
          />
        </label>
        <label className="space-y-1 text-xs font-bold text-primary">
          <span>الإصدار</span>
          <input
            value={value.version}
            onChange={(event) => set({ version: event.target.value || "1.0" })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
            dir="ltr"
            placeholder="1.0"
          />
        </label>
        <StudentContextSelect
          label="نوع الاستيراد"
          value={value.importMode}
          onChange={(importMode) =>
            set({
              importMode: importMode as StudyPlanImportContextState["importMode"],
              semesterCode: importMode === "single_semester" ? value.semesterCode : "",
            })
          }
          options={[
            { value: "full_plan", label: "خطة كاملة" },
            { value: "single_semester", label: "فصل محدد" },
          ]}
          disabled={isLoading}
          placeholder="اختر نوع الاستيراد"
        />
        {value.importMode === "single_semester" && (
          <StudentContextSelect
            label="الفصل الدراسي"
            value={value.semesterCode}
            onChange={(semesterCode) => set({ semesterCode: semesterCode as "first" | "second" })}
            options={[
              { value: "first", label: "الفصل الأول" },
              { value: "second", label: "الفصل الثاني" },
            ]}
            disabled={isLoading}
            placeholder="اختر الفصل"
          />
        )}
      </div>

      {existingPlanConflict && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
          توجد خطة مسبقاً لهذا البرنامج والإصدار. لا يتم الاستبدال الصامت في هذه المرحلة.
        </div>
      )}
      {!isReady && !existingPlanConflict && (
        <div className="text-xs text-muted-foreground">
          يجب اختيار القسم والبرنامج واسم الخطة والإصدار ونوع الاستيراد قبل المعاينة أو الاستيراد.
        </div>
      )}
    </div>
  );
}

function StudyPlanPreviewSummary({
  context,
  departmentName,
  programLabel,
  validation,
}: {
  context: StudyPlanImportContextState;
  departmentName?: string;
  programLabel?: string;
  validation: ValidationResult<unknown>;
}) {
  const missingCourses = new Set<string>();
  const missingPrereqs = new Set<string>();
  validation.rows.forEach((row) => {
    row.errors.forEach((error) => {
      if (error.column === "course_code") {
        const value = cellText(row.raw.course_code);
        if (value) missingCourses.add(value);
      }
      if (error.column === "prerequisite_course_code") {
        const value = cellText(row.raw.prerequisite_course_code);
        if (value) missingPrereqs.add(value);
      }
    });
  });

  return (
    <div className="rounded-xl border border-border bg-secondary/20 p-4 text-xs space-y-3">
      <div className="grid gap-2 md:grid-cols-3">
        <SummaryItem label="القسم" value={departmentName ?? "—"} />
        <SummaryItem label="البرنامج" value={programLabel ?? "—"} />
        <SummaryItem label="اسم الخطة" value={context.planName || "—"} />
        <SummaryItem label="الإصدار" value={context.version || "—"} />
        <SummaryItem
          label="نوع الاستيراد"
          value={context.importMode === "single_semester" ? "فصل محدد" : "خطة كاملة"}
        />
        <SummaryItem
          label="الفصل الدراسي"
          value={
            context.importMode === "single_semester"
              ? context.semesterCode || "—"
              : "متعدد حسب الملف"
          }
        />
        <SummaryItem label="إجمالي الصفوف" value={String(validation.totalRows)} />
        <SummaryItem label="صفوف صالحة" value={String(validation.validRows)} />
        <SummaryItem label="صفوف بأخطاء" value={String(validation.invalidRows)} />
      </div>
      {(missingCourses.size > 0 || missingPrereqs.size > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <MissingList title="المقررات غير الموجودة" values={[...missingCourses]} />
          <MissingList
            title="المتطلبات السابقة غير الموجودة/غير الصالحة"
            values={[...missingPrereqs]}
          />
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background px-3 py-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-bold text-primary">{value}</div>
    </div>
  );
}

function MissingList({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
      <div className="font-bold text-destructive">{title}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {values.map((value) => (
          <span key={value} className="rounded bg-background px-2 py-0.5 font-mono text-[11px]">
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

// ===== FACULTY-ACCOUNT-IMPORT-EXPORT-02 — accounts panel =====
type FacultyImportResult = Awaited<ReturnType<typeof importFacultyAccountsRows>>;
type FacultyImportRow = FacultyImportResult["results"][number];

function FacultyAccountsImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FacultyImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importAccountsFn = useServerFn(importFacultyAccountsRows);

  const downloadAccountsTemplate = async () => {
    const { loadXLSX } = await import("@/lib/xlsx-loader");
    const XLSX = await loadXLSX();
    const headers = [
      "employee_number",
      "email",
      "initial_password",
      "full_name_ar",
      "department_name",
      "academic_rank",
      "role",
      "force_password_change",
    ];
    const sample = [
      "F2025001",
      "faculty@example.com",
      "TempPass!23",
      "د. أحمد",
      "قسم علوم الحاسوب",
      "Assistant Professor",
      "faculty_member",
      "true",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Faculty Accounts");
    const inst = [
      ["التعليمات"],
      ["الأعمدة المطلوبة: employee_number, email, initial_password"],
      [
        "الأعمدة الاختيارية: full_name_ar, department_name, academic_rank, role, force_password_change, status",
      ],
      ["role فارغ = faculty_member"],
      ["force_password_change فارغ = true"],
      ["الربط يتم عبر employee_number فقط"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inst), "تعليمات");
    XLSX.writeFile(wb, "template_faculty_accounts.xlsx");
  };

  const onFile = async (f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
  };

  const runImport = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const parsed = await parseExcel(file);
      const rows = parsed.map((r, idx) => ({ ...r, row_number: idx + 2 }));
      const res = await importAccountsFn({ data: { rows } });
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? "فشل الاستيراد");
    } finally {
      setBusy(false);
    }
  };

  const downloadResultReport = async () => {
    if (!result) return;
    const { loadXLSX } = await import("@/lib/xlsx-loader");
    const XLSX = await loadXLSX();
    const STATUS_AR: Record<string, string> = {
      created: "تم الإنشاء",
      linked: "تم الربط",
      already_linked: "مربوط مسبقاً",
      failed: "فشل",
    };
    const data = result.results.map((r: FacultyImportRow) => ({
      row: r.row_number,
      employee_number: r.employee_number,
      full_name_ar: r.full_name_ar ?? "",
      email: r.email,
      status: STATUS_AR[r.status] ?? r.status,
      reason: r.reason ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import Report");
    XLSX.writeFile(
      wb,
      `faculty_accounts_import_report_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        نوع استيراد خاص لربط/إنشاء حسابات أعضاء هيئة التدريس عبر البريد الإلكتروني الرسمي. لا يتم
        توليد أي بريد افتراضي.
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={downloadAccountsTemplate}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-primary hover:border-gold"
        >
          <Download className="h-4 w-4" /> تنزيل القالب
        </button>
        <label className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground cursor-pointer hover:opacity-90">
          <Upload className="h-4 w-4" /> رفع ملف Excel
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </label>
        {file && (
          <span className="text-xs text-muted-foreground">
            الملف: <span className="font-mono">{file.name}</span>
          </span>
        )}
        {file && !result && (
          <button
            onClick={runImport}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            تنفيذ الاستيراد
          </button>
        )}
        {result && (
          <button
            onClick={downloadResultReport}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-primary hover:border-gold"
          >
            <FileDown className="h-3.5 w-3.5" /> تصدير التقرير Excel
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="إجمالي" value={result.totals.total} tone="neutral" />
            <Stat label="إنشاء" value={result.totals.created} tone="ok" />
            <Stat label="ربط" value={result.totals.linked} tone="ok" />
            <Stat label="مربوط مسبقاً" value={result.totals.already_linked} tone="neutral" />
            <Stat label="فشل" value={result.totals.failed} tone="bad" />
          </div>
          <div className="rounded-lg border border-border bg-background overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40">
                <tr>
                  <th className="px-2 py-1 text-right">الصف</th>
                  <th className="px-2 py-1 text-right">الرقم الوظيفي</th>
                  <th className="px-2 py-1 text-right">الاسم</th>
                  <th className="px-2 py-1 text-right">البريد</th>
                  <th className="px-2 py-1 text-right">الحالة</th>
                  <th className="px-2 py-1 text-right">السبب</th>
                </tr>
              </thead>
              <tbody>
                {result.results.slice(0, 500).map((r: FacultyImportRow) => (
                  <tr key={r.row_number} className="border-t border-border/60">
                    <td className="px-2 py-1 font-mono">{r.row_number}</td>
                    <td className="px-2 py-1 font-mono">{r.employee_number}</td>
                    <td className="px-2 py-1">{r.full_name_ar ?? "—"}</td>
                    <td className="px-2 py-1 font-mono">{r.email}</td>
                    <td
                      className={`px-2 py-1 font-bold ${
                        r.status === "created" || r.status === "linked"
                          ? "text-emerald-700"
                          : r.status === "already_linked"
                            ? "text-amber-700"
                            : "text-destructive"
                      }`}
                    >
                      {r.status === "created"
                        ? "تم الإنشاء"
                        : r.status === "linked"
                          ? "تم الربط"
                          : r.status === "already_linked"
                            ? "مربوط مسبقاً"
                            : "فشل"}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{r.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-card">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <div
              className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-extrabold ${
                done
                  ? "bg-emerald-600 text-white"
                  : active
                    ? "bg-gold text-primary"
                    : "bg-secondary text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-xs font-bold ${active ? "text-primary" : done ? "text-emerald-700" : "text-muted-foreground"}`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-1 hidden h-px w-6 bg-border sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

function ImportStats() {
  const statsFn = useServerFn(getImportStats);
  const { data } = useQuery({
    queryKey: ["import-stats"],
    queryFn: () => statsFn({ data: {} }),
  });
  const cards = [
    { label: "إجمالي الاستيرادات", value: data?.total ?? 0, tone: "neutral" as const },
    { label: "استيرادات اليوم", value: data?.today ?? 0, tone: "neutral" as const },
    { label: "ناجحة", value: data?.completed ?? 0, tone: "ok" as const },
    { label: "فاشلة", value: data?.failed ?? 0, tone: "bad" as const },
    { label: "نسبة النجاح %", value: data?.rate ?? 0, tone: "ok" as const },
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <h2 className="font-display text-sm font-bold text-primary flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-gold" /> إحصائيات الاستيراد الجماعي
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <Stat key={c.label} label={c.label} value={c.value} tone={c.tone} />
        ))}
      </div>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PreviewBlock({ validation }: { validation: ValidationResult<any> }) {
  const { totalRows, validRows, invalidRows, rows } = validation;
  const errorRows = useMemo(() => rows.filter((r) => r.errors.length > 0).slice(0, 100), [rows]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="إجمالي الصفوف" value={totalRows} tone="neutral" />
        <Stat label="صفوف صالحة" value={validRows} tone="ok" />
        <Stat label="صفوف بأخطاء" value={invalidRows} tone="bad" />
      </div>

      {errorRows.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-sm font-bold text-destructive mb-2">
            <AlertTriangle className="h-4 w-4" /> أخطاء التحقق (أول {errorRows.length} صف)
          </div>
          <div className="max-h-64 overflow-y-auto text-xs">
            <table className="w-full">
              <thead>
                <tr className="text-right text-muted-foreground border-b border-border">
                  <th className="py-1 px-2 w-16">الصف</th>
                  <th className="py-1 px-2 w-40">العمود</th>
                  <th className="py-1 px-2">الخطأ</th>
                </tr>
              </thead>
              <tbody>
                {errorRows.flatMap((r) =>
                  r.errors.map((e, i) => (
                    <tr key={`${r.rowNumber}-${i}`} className="border-b border-border/50">
                      <td className="py-1 px-2 font-mono">{r.rowNumber}</td>
                      <td className="py-1 px-2 font-mono">{e.column ?? "—"}</td>
                      <td className="py-1 px-2">{e.message}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportBlock({
  report,
  type,
  dryRun,
  durationMs,
  onDownload,
  onContinueRealImport,
  onStartOver,
}: {
  report: ImportReport;
  type: ImportType;
  dryRun: boolean;
  durationMs: number | null;
  onDownload: () => void;
  onContinueRealImport?: () => void;
  onStartOver?: () => void;
}) {
  const statLabels = getReportStatLabels(type, dryRun);
  const boxClass = dryRun
    ? "rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3"
    : "rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3";
  const titleClass = dryRun ? "font-bold text-amber-700" : "font-bold text-emerald-700";

  return (
    <div className={boxClass}>
      <div className={`flex items-center justify-between gap-2 ${titleClass}`}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" />
          {dryRun
            ? "تشغيل تجريبي مكتمل (لم تتم أي تغييرات)"
            : `تم تنفيذ استيراد ${TYPE_LABEL[type]}`}
        </div>
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-bold text-primary hover:border-gold"
        >
          <FileDown className="h-3.5 w-3.5" /> تنزيل التقرير
        </button>
      </div>
      <div
        className={`grid gap-3 ${statLabels.showUpdated ? "grid-cols-2 md:grid-cols-6" : "grid-cols-2 md:grid-cols-5"}`}
      >
        <Stat label="إجمالي" value={report.rows_total} tone="neutral" />
        <Stat label="نجح" value={report.rows_success} tone="ok" />
        <Stat label="فشل" value={report.rows_failed} tone="bad" />
        <Stat label={statLabels.created} value={report.rows_created ?? 0} tone="ok" />
        {statLabels.showUpdated && (
          <Stat label={statLabels.updated} value={report.rows_updated ?? 0} tone="neutral" />
        )}
        {type === "student_eligibility" && report.eligibility_summary && (
          <>
            <Stat label="مستجد" value={report.eligibility_summary.new_count} tone="neutral" />
            <Stat
              label="باقي/إعادة"
              value={report.eligibility_summary.repeat_count}
              tone="neutral"
            />
            <Stat
              label="محوّلون"
              value={report.eligibility_summary.transferred_count}
              tone="neutral"
            />
            <Stat
              label="سابق إيقاف"
              value={report.eligibility_summary.prior_suspension_count}
              tone="neutral"
            />
            <Stat
              label="مراجع مصدر"
              value={report.eligibility_summary.distinct_source_references}
              tone="neutral"
            />
          </>
        )}
        {type === "student_accounts" && report.student_accounts_summary && (
          <>
            <Stat
              label="READY_TO_CREATE"
              value={report.student_accounts_summary.ready_to_create}
              tone="ok"
            />
            <Stat
              label="ALREADY_LINKED"
              value={report.student_accounts_summary.already_linked}
              tone="neutral"
            />
            <Stat label="CONFLICT" value={report.student_accounts_summary.conflict} tone="bad" />
            <Stat
              label="STUDENT_NOT_FOUND"
              value={report.student_accounts_summary.student_not_found}
              tone="bad"
            />
            <Stat
              label="INVALID_EMAIL"
              value={report.student_accounts_summary.invalid_email}
              tone="bad"
            />
          </>
        )}
        <Stat label="الزمن (ms)" value={durationMs ?? 0} tone="neutral" />
      </div>
      {report.errors.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-bold text-destructive">
            أخطاء ({report.errors.length})
          </summary>
          <ul className="mt-2 list-disc pr-5 space-y-1 max-h-40 overflow-y-auto">
            {report.errors.slice(0, 100).map((e, i) => (
              <li key={i}>
                صف {e.row}
                {e.column ? ` [${e.column}]` : ""}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {(onContinueRealImport || onStartOver) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {onContinueRealImport && report.rows_success > 0 && (
            <button
              onClick={onContinueRealImport}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            >
              <CheckCircle2 className="h-4 w-4" /> تنفيذ الاستيراد الفعلي
            </button>
          )}
          {onStartOver && (
            <button onClick={onStartOver} className="text-xs font-bold text-primary underline">
              رفع ملف جديد
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "ok" ? "text-emerald-700" : tone === "bad" ? "text-destructive" : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-xl font-extrabold ${toneClass}`}>{value.toLocaleString("ar-EG")}</div>
    </div>
  );
}

type HistoryRow = {
  id: string;
  created_at: string;
  import_type: ImportType;
  file_name: string;
  rows_total: number;
  rows_success: number;
  rows_failed: number;
  status: string;
  notes: string | null;
};

function ImportHistory() {
  const listFn = useServerFn(listImportHistory);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["import-history"],
    queryFn: () => listFn({ data: {} }),
  });

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card">
      <h2 className="font-display text-lg font-bold text-primary flex items-center gap-2 mb-3">
        <History className="h-5 w-5 text-gold" /> سجل عمليات الاستيراد
      </h2>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">جارٍ التحميل...</div>
      ) : data.length === 0 ? (
        <div className="text-sm text-muted-foreground">لا توجد عمليات استيراد سابقة.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted-foreground border-b border-border">
                <th className="py-2 px-2 w-8" />
                <th className="py-2 px-2">التاريخ</th>
                <th className="py-2 px-2">النوع</th>
                <th className="py-2 px-2">الملف</th>
                <th className="py-2 px-2">إجمالي</th>
                <th className="py-2 px-2">نجح</th>
                <th className="py-2 px-2">فشل</th>
                <th className="py-2 px-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const isOpen = expanded === r.id;
                return (
                  <>
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 px-2">
                        {r.notes ? (
                          <button
                            onClick={() => setExpanded(isOpen ? null : r.id)}
                            className="text-primary"
                            aria-label="تفاصيل"
                          >
                            {isOpen ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        ) : null}
                      </td>
                      <td className="py-2 px-2 text-xs">
                        {new Date(r.created_at).toLocaleString("ar-EG")}
                      </td>
                      <td className="py-2 px-2">
                        {TYPE_LABEL[r.import_type as ImportType] ?? r.import_type}
                      </td>
                      <td className="py-2 px-2 font-mono text-xs">{r.file_name}</td>
                      <td className="py-2 px-2">{r.rows_total}</td>
                      <td className="py-2 px-2 text-emerald-700 font-bold">{r.rows_success}</td>
                      <td className="py-2 px-2 text-destructive font-bold">{r.rows_failed}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                            r.status === "completed"
                              ? "bg-emerald-100 text-emerald-700"
                              : r.status === "dry_run"
                                ? "bg-amber-100 text-amber-700"
                                : r.status === "partial"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {IMPORT_LOG_STATUS_AR[r.status] ?? r.status}
                        </span>
                      </td>
                    </tr>
                    {isOpen && r.notes && (
                      <tr key={`${r.id}-d`} className="bg-secondary/20">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="text-xs font-bold text-primary mb-1 flex items-center gap-1">
                            <XCircle className="h-3.5 w-3.5 text-destructive" /> ملخص الأخطاء
                          </div>
                          <div className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
                            {r.notes}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
