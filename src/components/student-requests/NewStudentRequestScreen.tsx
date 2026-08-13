import { useNavigate } from "@tanstack/react-router";
import { useStudentRequestRoutes } from "@/lib/student-requests/surface";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getStudentRequestTypesForStudent,
  getStudentRequestUiContext,
  getStudentRequestFormReferenceData,
  submitCanonicalStudentRequest,
} from "@/lib/student-affairs.functions";
import { STUDENT_REQUEST_INELIGIBLE_DEFAULT_MSG } from "@/lib/student-request-rpc";
import {
  DynamicStudentRequestForm,
  isDynamicFormSupported,
} from "@/components/student-requests/DynamicStudentRequestForm";
import { StudentRequestEligibilityNotice } from "@/components/student-requests/StudentRequestEligibilityNotice";
import {
  getEmptyFormValues,
  getStudentRequestFormDefinition,
  validateStudentRequestFormValues,
} from "@/lib/student-requests/request-form-registry";
import {
  canSubmitStudentRequestFromUi,
  getStudentRequestUiEligibility,
} from "@/lib/student-requests/request-eligibility-ui";
import {
  filterStudentRequestTypesForDisplay,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";
import { sanitizeFormDataForSubmit } from "@/lib/student-requests/student-request-submit-contract";
import {
  canSubmitWithReferenceData,
  getRequestServiceAdapter,
  validateB1ServiceActivation,
  type ReferenceDataState,
} from "@/lib/student-requests/request-service-adapter";
import { isB1ServiceCode } from "@/lib/student-requests/b1-ui";


type RequestTypeOption = {
  id: string;
  code: string;
  name_ar: string;
  description_ar: string | null;
  requires_attachment: boolean;
  request_audience?: string | null;
  ineligible_display_mode?: string | null;
  is_eligible: boolean;
  is_disabled: boolean;
  disabled_reason: string | null;
};

export function NewStudentRequestScreen({ typeFromSearch }: { typeFromSearch?: string }) {
  const routes = useStudentRequestRoutes();
  const navigate = useNavigate();
  const typesFn = useServerFn(getStudentRequestTypesForStudent);
  const contextFn = useServerFn(getStudentRequestUiContext);
  const submitFn = useServerFn(submitCanonicalStudentRequest);
  const referenceDataFn = useServerFn(getStudentRequestFormReferenceData);
  const [requestType, setRequestType] = useState(typeFromSearch ?? "");
  const [subject, setSubject] = useState("");
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const submitInFlightRef = useRef(false);
  const completedClientIdsRef = useRef(new Set<string>());

  const {
    data: types = [],
    isLoading,
    error: typesError,
  } = useQuery({
    queryKey: ["student-affairs", "types"],
    queryFn: () => typesFn({ data: {} }),
  });

  const {
    data: studentContext,
    isLoading: contextLoading,
    error: contextError,
  } = useQuery({
    queryKey: ["student-affairs", "ui-context"],
    queryFn: () => contextFn({ data: {} }),
    staleTime: 60_000,
  });

  const typedTypes = filterStudentRequestTypesForDisplay(types as RequestTypeOption[]);

  useEffect(() => {
    if (!typeFromSearch) return;
    const canonical = normalizeStudentRequestTypeCode(typeFromSearch);
    if (isB1ServiceCode(canonical)) {
      void navigate({
        to: routes.b1Service,
        params: { service: canonical },
        replace: true,
      });
      return;
    }
    const match = typedTypes.find((t) => t.code === typeFromSearch);
    if (match && match.is_eligible && !match.is_disabled) {
      setRequestType(match.code);
    }
  }, [typeFromSearch, typedTypes, navigate]);
  const selectedType = useMemo(
    () => typedTypes.find((type) => type.code === requestType),
    [typedTypes, requestType],
  );
  const formDefinition = useMemo(
    () => (requestType ? getStudentRequestFormDefinition(requestType) : undefined),
    [requestType],
  );
  const formSupported = isDynamicFormSupported(requestType);
  const normalizedRequestType = normalizeStudentRequestTypeCode(requestType);
  const selectedAdapter = getRequestServiceAdapter(normalizedRequestType);
  const serviceActivation = selectedAdapter
    ? validateB1ServiceActivation({ requestTypeCode: normalizedRequestType })
    : { ok: true as const };
  const selectedAcademicYear =
    typeof formValues.target_academic_year === "string"
      ? formValues.target_academic_year
      : undefined;
  const needsReferenceData = Boolean(selectedAdapter?.referenceResolvers.length);
  const {
    data: loadedReferenceData,
    isLoading: referenceDataLoading,
    error: referenceDataError,
  } = useQuery({
    queryKey: ["student-affairs", "request-form-reference-data", selectedAcademicYear ?? null],
    queryFn: () => referenceDataFn({ data: { academicYearId: selectedAcademicYear } }),
    enabled: needsReferenceData,
  });
  const referenceData = useMemo<Readonly<Record<string, ReferenceDataState>>>(
    () => ({
      academic_years: referenceDataLoading
        ? { status: "loading", options: [] }
        : referenceDataError
          ? { status: "error", options: [], message: (referenceDataError as Error).message }
          : { status: "ready", options: loadedReferenceData?.academicYears ?? [] },
      semesters_for_year:
        !selectedAcademicYear || referenceDataLoading
          ? { status: "loading", options: [] }
          : referenceDataError
            ? { status: "error", options: [], message: (referenceDataError as Error).message }
            : { status: "ready", options: loadedReferenceData?.semesters ?? [] },
      current_student_enrollments: referenceDataLoading
        ? { status: "loading", options: [] }
        : referenceDataError
          ? { status: "error", options: [], message: (referenceDataError as Error).message }
          : { status: "ready", options: loadedReferenceData?.currentStudentEnrollments ?? [] },
    }),
    [loadedReferenceData, referenceDataError, referenceDataLoading, selectedAcademicYear],
  );

  useEffect(() => {
    if (selectedAcademicYear && formValues.target_semester) {
      setFormValues((current) => ({ ...current, target_semester: "" }));
    }
    // Reset the dependent semester only when the academic year changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAcademicYear]);

  useEffect(() => {
    setSubmitAttempted(false);
    if (!requestType) {
      setFormValues({});
      return;
    }
    const def = getStudentRequestFormDefinition(requestType);
    if (def) {
      setFormValues(getEmptyFormValues(def));
      if (!subject.trim()) {
        setSubject(def.titleAr);
      }
    } else {
      setFormValues({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when type changes only
  }, [requestType]);

  const selectableTypes = typedTypes.filter((t) => t.is_eligible && !t.is_disabled);
  const allDisabled =
    typedTypes.length > 0 && typedTypes.every((t) => t.is_disabled || !t.is_eligible);
  const ineligibleBanner = allDisabled
    ? (typedTypes[0]?.disabled_reason ?? STUDENT_REQUEST_INELIGIBLE_DEFAULT_MSG)
    : null;

  const formValidation = useMemo(() => {
    if (!formDefinition)
      return { valid: false, missingLabels: [] as string[], missingFields: [] as string[] };
    return validateStudentRequestFormValues(formDefinition, formValues);
  }, [formDefinition, formValues]);

  const eligibilityInput = useMemo(
    () => ({
      requestTypeCode: requestType,
      studentContext: studentContext ?? null,
      typePickerState: selectedType
        ? {
            is_eligible: selectedType.is_eligible,
            is_disabled: selectedType.is_disabled,
            disabled_reason: selectedType.disabled_reason,
            request_audience: selectedType.request_audience,
            ineligible_display_mode: selectedType.ineligible_display_mode,
          }
        : null,
      formValidation,
      serviceWindow: { checked: false },
      formSupported,
      hasSubject: !!subject.trim(),
    }),
    [requestType, studentContext, selectedType, formValidation, formSupported, subject],
  );

  const eligibilityDecision = getStudentRequestUiEligibility(eligibilityInput);
  const canSubmitForm =
    !!selectedType &&
    selectedType.is_eligible &&
    !selectedType.is_disabled &&
    !selectedType.requires_attachment &&
    serviceActivation.ok &&
    (!selectedAdapter ||
      canSubmitWithReferenceData(selectedAdapter.referenceResolvers, referenceData)) &&
    eligibilityDecision.badge === "available";

  const submitRequest = async () => {
    if (submitInFlightRef.current || submitting) return;
    setSubmitAttempted(true);
    if (!selectedType?.is_eligible || selectedType.is_disabled || !formDefinition) return;
    if (!serviceActivation.ok) {
      toast.error("الخدمة غير متاحة للتفعيل حالياً");
      return;
    }
    if (!formValidation.valid || !subject.trim()) {
      toast.error("يرجى إكمال الحقول المطلوبة", {
        description: formValidation.missingLabels.slice(0, 3).join("، "),
      });
      return;
    }
    if (!canSubmitStudentRequestFromUi(eligibilityInput)) {
      toast.error("لا يمكن إرسال الطلب حالياً", {
        description: "راجع بطاقة الأهلية والتوفر أعلاه.",
      });
      return;
    }
    const clientRequestId = crypto.randomUUID();
    if (completedClientIdsRef.current.has(clientRequestId)) return;

    submitInFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const formData = sanitizeFormDataForSubmit(formValues);
      const result = await submitFn({
        data: {
          requestTypeId: selectedType.id,
          requestTypeCode: normalizedRequestType,
          title: subject,
          formData,
          clientRequestId,
        },
      });
      completedClientIdsRef.current.add(clientRequestId);
      toast.success("تم إرسال الطلب", {
        description: "انتقل الطلب إلى حالة: مُرسَل — بانتظار المراجعة.",
      });
      navigate({ to: routes.detail, params: { id: result.id } });
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error("تعذر إرسال الطلب", { description: msg });
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitRequest();
  };

  const pickType = (code: string, disabled: boolean) => {
    if (disabled) return;
    // B1 services own a dedicated route with their real form, autosave,
    // secure attachments and submit contract. The legacy generic form on this
    // page cannot serve them, so route the student to the B1 form instead of
    // selecting the code locally.
    const canonical = normalizeStudentRequestTypeCode(code);
    if (isB1ServiceCode(canonical)) {
      void navigate({
        to: routes.b1Service,
        params: { service: canonical },
      });
      return;
    }
    setRequestType(code);
    setSubject("");
  };

  return (
    <div dir="rtl" className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-extrabold text-primary flex items-center gap-2">
          <FilePlus2 className="h-6 w-6 text-gold" /> تقديم طلب شؤون طلاب
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          اختر نوع الطلب وعبّئ النموذج المناسب. تُعرض حالة الأهلية والتوفر قبل الإرسال — التحقق
          النهائي يتم لاحقاً من النظام.
        </p>
      </header>

      {(typesError || contextError) && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          تعذر التحقق من أهلية الخدمة حالياً. أعد المحاولة أو حدّث الصفحة؛ لم يصدر قرار بعدم
          الأهلية.
        </div>
      )}

      {contextLoading && requestType && (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
        >
          <Loader2 className="ml-2 inline h-4 w-4 animate-spin" /> جارٍ التحقق من أهلية الخدمة…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {ineligibleBanner && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{ineligibleBanner}</span>
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3">
        <h2 className="text-sm font-bold text-primary">أنواع الطلبات المتاحة</h2>
        {isLoading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : typedTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أنواع طلبات متاحة حالياً.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {typedTypes.map((type) => {
              const disabled = type.is_disabled || !type.is_eligible;
              const selected = requestType === type.code;
              return (
                <button
                  key={type.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickType(type.code, disabled)}
                  className={`rounded-lg border p-3 text-right transition-colors ${
                    disabled
                      ? "cursor-not-allowed border-border/60 bg-muted/40 opacity-60"
                      : selected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:bg-secondary/30"
                  }`}
                >
                  <div className="font-bold text-sm text-primary">{type.name_ar}</div>
                  {type.description_ar && (
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {type.description_ar}
                    </div>
                  )}
                  {disabled && type.disabled_reason && (
                    <div className="mt-2 text-[11px] font-bold text-amber-800">
                      {type.disabled_reason}
                    </div>
                  )}
                  {type.requires_attachment && !disabled && (
                    <div className="mt-1 text-[11px] font-bold text-amber-700">
                      يتطلب مرفقاً — الرفع غير مفعّل حالياً في هذه الواجهة
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <form
        onSubmit={onSubmit}
        noValidate
        className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4"
      >
        {selectableTypes.length > 0 && !requestType && (
          <p className="text-xs text-muted-foreground">اختر نوع الطلب من القائمة أعلاه للمتابعة.</p>
        )}

        {requestType && <StudentRequestEligibilityNotice {...eligibilityInput} />}

        {selectedType?.requires_attachment && (
          <div
            role="note"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
          >
            هذا النوع يتطلب مرفقات. رفع الملفات غير مفعّل حالياً — لا يمكن إرسال الطلب حتى يتوفر
            نظام المرفقات.
          </div>
        )}

        {selectedType && !formSupported && (
          <DynamicStudentRequestForm
            requestTypeCode={requestType}
            value={formValues}
            onChange={setFormValues}
            disabled
          />
        )}

        {selectedType && formSupported && formDefinition && (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-primary">موضوع الطلب</span>
              <input
                required
                disabled={selectedType.is_disabled || submitting}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
              />
              {submitAttempted && !subject.trim() && (
                <span role="alert" className="text-[11px] text-destructive">
                  موضوع الطلب مطلوب.
                </span>
              )}
            </label>

            <DynamicStudentRequestForm
              requestTypeCode={requestType}
              value={formValues}
              onChange={setFormValues}
              disabled={selectedType.is_disabled || submitting}
              referenceData={referenceData}
              fieldErrors={
                submitAttempted
                  ? Object.fromEntries(
                      formValidation.missingFields.map((field) => [field, "هذا الحقل مطلوب."]),
                    )
                  : {}
              }
            />
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={submitting || !canSubmitForm}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} إرسال الطلب
          </button>
        </div>
      </form>
    </div>
  );
}
