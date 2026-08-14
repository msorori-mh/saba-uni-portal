import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getStudentRequestFormDefinition,
  type RequestFormFieldDefinition,
} from "@/lib/student-requests/request-form-registry";
import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";
import type { ReferenceDataState } from "@/lib/student-requests/request-service-adapter";
import { SecureStudentRequestAttachmentsField } from "./SecureStudentRequestAttachmentsField";
import type { SecureAttachmentReference } from "@/lib/student-requests/secure-attachments-contract";

export type DynamicStudentRequestFormProps = {
  requestTypeCode: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  disabled?: boolean;
  referenceData?: Readonly<Record<string, ReferenceDataState | undefined>>;
  studentRequestId?: string | null;
  studentProfileId?: string | null;
  fieldErrors?: Readonly<Record<string, string | undefined>>;
};

const UNSUPPORTED_MSG = "هذا النوع من الطلب غير مدعوم حالياً في النموذج الجديد.";

function fieldVisible(field: RequestFormFieldDefinition, values: Record<string, unknown>): boolean {
  if (!field.dependsOn) return true;
  const current = values[field.dependsOn.field];
  if (field.dependsOn.equals !== undefined) return current === field.dependsOn.equals;
  return Boolean(current);
}

function setField(
  values: Record<string, unknown>,
  name: string,
  next: unknown,
  onChange: (v: Record<string, unknown>) => void,
) {
  onChange({ ...values, [name]: next });
}

export function DynamicStudentRequestForm({
  requestTypeCode,
  value,
  onChange,
  disabled = false,
  referenceData = {},
  studentRequestId = null,
  studentProfileId = null,
  fieldErrors = {},
}: DynamicStudentRequestFormProps) {
  const normalized = normalizeStudentRequestTypeCode(requestTypeCode);
  const definition = getStudentRequestFormDefinition(requestTypeCode);

  if (!definition) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2"
      >
        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">{UNSUPPORTED_MSG}</p>
          {normalized && normalized !== requestTypeCode && (
            <p className="mt-1 text-xs text-muted-foreground">الكود المُطبَّع: {normalized}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      <header className="space-y-1">
        <h3 className="text-sm font-bold text-primary">{definition.titleAr}</h3>
        {definition.descriptionAr && (
          <p className="text-xs text-muted-foreground">{definition.descriptionAr}</p>
        )}
      </header>

      {definition.warnings?.map((w) => (
        <div
          key={w}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{w}</span>
        </div>
      ))}

      {definition.requiredAttachments && definition.requiredAttachments.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          <div className="font-bold text-primary mb-1">المرفقات المطلوبة</div>
          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
            {definition.requiredAttachments.map((a) => (
              <li key={a.key}>
                {a.labelAr}
                {a.required && <span className="text-rose-700 font-bold"> *</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {definition.sections.map((section, si) => (
        <fieldset key={si} className="space-y-3 rounded-lg border border-border p-4">
          {section.titleAr && (
            <legend className="text-xs font-bold text-primary px-1">{section.titleAr}</legend>
          )}
          {section.fields.map((field) => {
            if (!fieldVisible(field, value)) return null;
            return (
              <FormField
                key={field.name}
                field={field}
                value={value}
                onChange={onChange}
                disabled={disabled}
                referenceState={
                  field.referenceResolverKey ? referenceData[field.referenceResolverKey] : undefined
                }
                secureContext={
                  normalized === "excused_absence" && field.name === "excuse_documents"
                    ? { studentRequestId, studentProfileId }
                    : undefined
                }
                error={fieldErrors[field.name]}
              />
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

function FormField({
  field,
  value,
  onChange,
  disabled,
  referenceState,
  secureContext,
  error,
}: {
  field: RequestFormFieldDefinition;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled?: boolean;
  referenceState?: ReferenceDataState;
  secureContext?: { studentRequestId: string | null; studentProfileId: string | null };
  error?: string;
}) {
  const fieldValue = value[field.name];

  if (field.type === "file" && secureContext) {
    return (
      <SecureStudentRequestAttachmentsField
        studentRequestId={secureContext.studentRequestId}
        studentProfileId={secureContext.studentProfileId}
        value={Array.isArray(fieldValue) ? (fieldValue as SecureAttachmentReference[]) : []}
        onChange={(next) => setField(value, field.name, next, onChange)}
        disabled={disabled}
      />
    );
  }

  if (field.type === "info") {
    return (
      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {field.labelAr !== "ملاحظة" && (
          <div className="font-bold text-primary mb-0.5">{field.labelAr}</div>
        )}
        <p>{String(field.defaultValue ?? field.helperTextAr ?? "")}</p>
      </div>
    );
  }

  if (field.type === "readonly") {
    return (
      <div className="space-y-1">
        <Label className="text-xs font-bold text-primary">{field.labelAr}</Label>
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {String(fieldValue ?? field.defaultValue ?? "—")}
        </div>
        {field.helperTextAr && (
          <p className="text-[10px] text-muted-foreground">{field.helperTextAr}</p>
        )}
        {error && (
          <p role="alert" className="text-[11px] text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={fieldValue === true}
          disabled={disabled}
          onChange={(e) => setField(value, field.name, e.target.checked, onChange)}
        />
        <span className="text-xs leading-relaxed">
          {field.labelAr}
          {field.required && <span className="text-rose-600"> *</span>}
        </span>
      </label>
    );
  }

  if (field.type === "select") {
    const resolvedOptions = field.referenceResolverKey
      ? referenceState?.status === "ready"
        ? referenceState.options
        : []
      : field.options;
    const referenceBlocked = Boolean(
      field.referenceResolverKey && referenceState?.status !== "ready",
    );
    return (
      <div className="space-y-1">
        <Label className="text-xs font-bold text-primary">
          {field.labelAr}
          {field.required && <span className="text-rose-600"> *</span>}
        </Label>
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
          value={String(fieldValue ?? "")}
          disabled={disabled || referenceBlocked}
          onChange={(e) => setField(value, field.name, e.target.value, onChange)}
        >
          <option value="">— اختر —</option>
          {resolvedOptions?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.labelAr}
            </option>
          ))}
        </select>
        {field.referenceResolverKey && referenceState?.status === "loading" && (
          <p className="text-[10px] text-muted-foreground">جارٍ تحميل البيانات المرجعية…</p>
        )}
        {field.referenceResolverKey && (!referenceState || referenceState.status === "error") && (
          <p className="text-[10px] text-destructive">
            تعذر تحميل البيانات المرجعية؛ الإرسال معطّل.
          </p>
        )}
        {field.helperTextAr && (
          <p className="text-[10px] text-muted-foreground">{field.helperTextAr}</p>
        )}
        {error && (
          <p role="alert" className="text-[11px] text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (field.type === "multi_select") {
    const selected = Array.isArray(fieldValue) ? (fieldValue as string[]) : [];
    const resolvedOptions = field.referenceResolverKey
      ? referenceState?.status === "ready"
        ? referenceState.options
        : []
      : field.options;
    return (
      <div className="space-y-1">
        <Label className="text-xs font-bold text-primary">
          {field.labelAr}
          {field.required && <span className="text-rose-600"> *</span>}
        </Label>
        <div className="rounded-lg border border-border p-2 space-y-1 max-h-40 overflow-y-auto">
          {resolvedOptions?.map((o) => {
            const checked = selected.includes(o.value);
            return (
              <label key={o.value} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={
                    disabled ||
                    Boolean(field.referenceResolverKey && referenceState?.status !== "ready")
                  }
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, o.value]
                      : selected.filter((v) => v !== o.value);
                    setField(value, field.name, next, onChange);
                  }}
                />
                <span>{o.labelAr}</span>
              </label>
            );
          })}
        </div>
        {field.referenceResolverKey && referenceState?.status !== "ready" && (
          <p className="text-[10px] text-destructive">تعذر تحميل تسجيلات الطالب؛ الإرسال معطّل.</p>
        )}
        {field.helperTextAr && (
          <p className="text-[10px] text-muted-foreground">{field.helperTextAr}</p>
        )}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div className="space-y-1">
        <Label className="text-xs font-bold text-primary">
          {field.labelAr}
          {field.required && <span className="text-rose-600"> *</span>}
        </Label>
        <Input
          type="date"
          dir="ltr"
          className="text-sm"
          value={String(fieldValue ?? "")}
          disabled={disabled}
          onChange={(e) => setField(value, field.name, e.target.value, onChange)}
        />
        {field.helperTextAr && (
          <p className="text-[10px] text-muted-foreground">{field.helperTextAr}</p>
        )}
      </div>
    );
  }

  if (field.type === "date_range") {
    const startKey = `${field.name}_start`;
    const endKey = `${field.name}_end`;
    return (
      <div className="space-y-1">
        <Label className="text-xs font-bold text-primary">
          {field.labelAr}
          {field.required && <span className="text-rose-600"> *</span>}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            dir="ltr"
            placeholder="من"
            value={String(value[startKey] ?? "")}
            disabled={disabled}
            onChange={(e) => setField(value, startKey, e.target.value, onChange)}
          />
          <Input
            type="date"
            dir="ltr"
            placeholder="إلى"
            value={String(value[endKey] ?? "")}
            disabled={disabled}
            onChange={(e) => setField(value, endKey, e.target.value, onChange)}
          />
        </div>
        {field.helperTextAr && (
          <p className="text-[10px] text-muted-foreground">{field.helperTextAr}</p>
        )}
      </div>
    );
  }

  if (field.type === "file") {
    const file = fieldValue instanceof File ? fieldValue : null;
    return (
      <div className="space-y-1">
        <Label className="text-xs font-bold text-primary">
          {field.labelAr}
          {field.required && <span className="text-rose-600"> *</span>}
        </Label>
        <Input
          type="file"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setField(value, field.name, f, onChange);
          }}
        />
        {file && (
          <p className="text-[10px] text-muted-foreground">
            الملف المختار: {file.name}
          </p>
        )}
        {field.helperTextAr && (
          <p className="text-[10px] text-muted-foreground">{field.helperTextAr}</p>
        )}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="space-y-1">
        <Label className="text-xs font-bold text-primary">
          {field.labelAr}
          {field.required && <span className="text-rose-600"> *</span>}
        </Label>
        <Textarea
          rows={4}
          value={String(fieldValue ?? "")}
          placeholder={field.placeholderAr}
          disabled={disabled}
          onChange={(e) => setField(value, field.name, e.target.value, onChange)}
        />
        {field.helperTextAr && (
          <p className="text-[10px] text-muted-foreground">{field.helperTextAr}</p>
        )}
        {error && (
          <p role="alert" className="text-[11px] text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs font-bold text-primary">
        {field.labelAr}
        {field.required && <span className="text-rose-600"> *</span>}
      </Label>
      <Input
        value={String(fieldValue ?? "")}
        placeholder={field.placeholderAr}
        disabled={disabled}
        onChange={(e) => setField(value, field.name, e.target.value, onChange)}
      />
      {field.helperTextAr && (
        <p className="text-[10px] text-muted-foreground">{field.helperTextAr}</p>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Whether the request type has a dynamic form definition. */
export function isDynamicFormSupported(requestTypeCode: string): boolean {
  return getStudentRequestFormDefinition(requestTypeCode) != null;
}

export { UNSUPPORTED_MSG };
