import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getEmptyFormValues,
  getStudentRequestFormDefinition,
  type RequestFormFieldDefinition,
  type RequestFormFieldOption,
} from "@/lib/student-requests/request-form-registry";
import {
  B1AdapterError,
  b1AdapterErrorMessageAr,
  b1ValidationMessageAr,
  getB1ServiceConfig,
  getB1UiAdapter,
  validateB1FormValues,
  type B1CanonicalCode,
  type B1Draft,
  type B1FormOptions,
} from "@/lib/student-requests/b1-ui";
import { B1AttachmentUploader } from "./B1AttachmentUploader";
import { B1DraftStatus, type B1DraftSaveState } from "./B1DraftStatus";
import { B1ErrorState } from "./B1ErrorState";
import { B1LoadingState } from "./B1LoadingState";
import { B1RequestSummary } from "./B1RequestSummary";
import { B1ServiceHeader } from "./B1ServiceHeader";
import { B1SubmissionConfirmation } from "./B1SubmissionConfirmation";

export function B1StudentRequestForm({ serviceCode }: { serviceCode: B1CanonicalCode }) {
  const navigate = useNavigate();
  const adapter = useMemo(() => getB1UiAdapter(), []);
  const config = getB1ServiceConfig(serviceCode)!;
  const definition = getStudentRequestFormDefinition(serviceCode)!;
  const [draft, setDraft] = useState<B1Draft | null>(null);
  const [options, setOptions] = useState<B1FormOptions | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    getEmptyFormValues(definition),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<B1DraftSaveState>("idle");
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  const load = () => {
    setFatalError(null);
    void Promise.all([
      adapter.getAvailableB1RequestTypes(),
      adapter.getB1RequestFormOptions(serviceCode),
    ])
      .then(async ([availability, loadedOptions]) => {
        const available = availability.some(
          (item) => item.code === serviceCode && item.studentVisible && item.runtimeAvailable,
        );
        if (!available) throw new B1AdapterError("ACTIVATION_BLOCKED", "Service inactive");
        const created = await adapter.createB1RequestDraft(serviceCode);
        setDraft(created);
        setValues({ ...getEmptyFormValues(definition), ...created.formData });
        setOptions(loadedOptions);
      })
      .catch((error) => setFatalError(b1AdapterErrorMessageAr(error)));
  };

  useEffect(load, [adapter, definition, serviceCode]);

  const changeField = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setSaveState("idle");
  };

  const save = async () => {
    if (!draft) return;
    setSaveState("saving");
    try {
      const saved = await adapter.saveB1RequestDraft(draft.requestId, values);
      setDraft(saved);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const review = () => {
    const validationValues = { ...values };
    for (const attachment of draft?.attachments ?? []) {
      validationValues[attachment.attachmentType] = {
        fileName: attachment.fileName,
        storagePath: attachment.storageRef,
      };
    }
    const result = validateB1FormValues(serviceCode, validationValues);
    const nextErrors = { ...result.errors };
    for (const requirement of definition.requiredAttachments ?? []) {
      if (!draft?.attachments.some((item) => item.attachmentType === requirement.key)) {
        nextErrors[requirement.key] = "secure_attachment_required";
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setReviewing(true);
  };

  const submit = async () => {
    if (!draft || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      const saved = await adapter.saveB1RequestDraft(draft.requestId, values);
      const result = await adapter.submitB1Request(saved.requestId, saved.updatedAt);
      setConfirming(false);
      await navigate({ to: "/student/requests/$id", params: { id: result.requestId } });
    } catch (error) {
      setFatalError(b1AdapterErrorMessageAr(error));
      setConfirming(false);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  if (fatalError && !draft) return <B1ErrorState messageAr={fatalError} onRetry={load} />;
  if (!draft || !options) return <B1LoadingState labelAr="جارٍ إعداد مسودة الطلب…" />;

  const summaryItems = definition.sections.flatMap((section) =>
    section.fields
      .filter((field) => field.type !== "info" && field.type !== "file")
      .map((field) => ({
        labelAr: field.labelAr,
        valueAr: formatValue(field, values[field.name]),
      })),
  );

  return (
    <div
      dir="rtl"
      data-testid="b1-student-request-form"
      data-service-code={serviceCode}
      className="space-y-5"
    >
      <B1ServiceHeader
        titleAr={config.titleAr}
        descriptionAr={config.descriptionAr}
        requirementsAr={definition.warnings}
        feePolicyAr={config.feePolicyLabelAr}
      />
      <B1DraftStatus state={saveState} updatedAt={draft.updatedAt} />
      {fatalError ? (
        <B1ErrorState messageAr={fatalError} onRetry={() => setFatalError(null)} />
      ) : null}

      {!reviewing ? (
        <form
          className="space-y-5 rounded-xl border border-border bg-card p-4 shadow-card sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            review();
          }}
        >
          {definition.sections.map((section, index) => (
            <fieldset key={section.titleAr ?? index} className="grid gap-4 sm:grid-cols-2">
              {section.titleAr ? (
                <legend className="col-span-full font-bold text-primary">{section.titleAr}</legend>
              ) : null}
              {section.fields
                .filter((field) => field.type !== "file")
                .map((field) => (
                  <B1Field
                    key={field.name}
                    field={field}
                    value={values[field.name]}
                    error={errors[field.name]}
                    options={resolveOptions(field, values, options)}
                    onChange={(value) => changeField(field.name, value)}
                  />
                ))}
            </fieldset>
          ))}

          {definition.requiredAttachments?.map((attachment) => (
            <div key={attachment.key} className="space-y-1">
              <B1AttachmentUploader
                attachments={draft.attachments.filter(
                  (item) => item.attachmentType === attachment.key,
                )}
                onUpload={async (file) => {
                  const uploaded = await adapter.uploadB1RequestAttachment(
                    draft.requestId,
                    attachment.key,
                    file,
                  );
                  setDraft((current) =>
                    current
                      ? { ...current, attachments: [...current.attachments, uploaded] }
                      : current,
                  );
                  setErrors((current) => {
                    const next = { ...current };
                    delete next[attachment.key];
                    return next;
                  });
                }}
                onRemove={async (attachmentId) => {
                  await adapter.removeB1RequestAttachment(draft.requestId, attachmentId);
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          attachments: current.attachments.filter(
                            (item) => item.attachmentId !== attachmentId,
                          ),
                        }
                      : current,
                  );
                }}
              />
              {errors[attachment.key] ? (
                <p role="alert" className="text-xs font-bold text-destructive">
                  {b1ValidationMessageAr(errors[attachment.key])}
                </p>
              ) : null}
            </div>
          ))}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void save()}
              className="min-h-11 rounded-lg border border-primary px-4 text-sm font-bold text-primary"
            >
              حفظ المسودة
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              مراجعة الطلب
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <B1RequestSummary items={summaryItems} attachments={draft.attachments} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setReviewing(false)}
              className="min-h-11 rounded-lg border border-primary px-4 text-sm font-bold text-primary"
            >
              تعديل البيانات
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              إرسال الطلب
            </button>
          </div>
        </div>
      )}

      <B1SubmissionConfirmation
        open={confirming}
        onOpenChange={setConfirming}
        titleAr="تأكيد إرسال الطلب"
        bodyAr="راجع البيانات والمرفقات قبل الإرسال. لن تتمكن من تعديل المسودة بعد الإرسال."
        submitting={submitting}
        onConfirm={() => void submit()}
      />
    </div>
  );
}

function B1Field({
  field,
  value,
  error,
  options,
  onChange,
}: {
  field: RequestFormFieldDefinition;
  value: unknown;
  error?: string;
  options?: readonly RequestFormFieldOption[];
  onChange: (value: unknown) => void;
}) {
  if (field.type === "info" || field.type === "readonly") {
    return (
      <div className="rounded-lg bg-muted/40 p-3 text-sm">
        <strong>{field.labelAr}: </strong>
        {String(field.defaultValue ?? value ?? "—")}
      </div>
    );
  }
  const common = "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";
  return (
    <label className={field.type === "textarea" ? "space-y-1 sm:col-span-2" : "space-y-1"}>
      <span className="block text-sm font-bold text-primary">
        {field.labelAr}
        {field.required ? " *" : ""}
      </span>
      {field.type === "checkbox" ? (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : field.type === "textarea" ? (
        <textarea
          rows={4}
          className={`${common} py-2`}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === "select" ? (
        <select
          className={common}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">اختر…</option>
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.labelAr}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "date" ? "date" : "text"}
          dir={field.type === "date" ? "ltr" : "rtl"}
          className={common}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? (
        <span role="alert" className="block text-xs font-bold text-destructive">
          {b1ValidationMessageAr(error)}
        </span>
      ) : null}
    </label>
  );
}

function resolveOptions(
  field: RequestFormFieldDefinition,
  values: Record<string, unknown>,
  options: B1FormOptions,
) {
  const dependency = String(values[field.referenceDependsOnField ?? ""] ?? "");
  if (field.referenceResolverKey === "academic_years") return options.academicYears;
  if (field.referenceResolverKey === "semesters_for_year")
    return options.semestersByYear[dependency] ?? [];
  if (field.referenceResolverKey === "current_student_enrollments")
    return options.currentEnrollments;
  if (field.referenceResolverKey === "available_departments") return options.availableDepartments;
  if (field.referenceResolverKey === "available_programs")
    return options.programsByDepartment[dependency] ?? [];
  return field.options;
}

function formatValue(field: RequestFormFieldDefinition, value: unknown) {
  if (field.type === "checkbox") return value === true ? "نعم" : "لا";
  return field.options?.find((option) => option.value === value)?.labelAr ?? String(value ?? "—");
}
