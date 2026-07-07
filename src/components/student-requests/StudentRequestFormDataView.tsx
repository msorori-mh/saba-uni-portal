import {
  getStudentRequestFormDefinition,
  type RequestFormFieldDefinition,
} from "@/lib/student-requests/request-form-registry";

function fieldVisible(
  field: RequestFormFieldDefinition,
  values: Record<string, unknown>,
): boolean {
  if (!field.dependsOn) return true;
  const current = values[field.dependsOn.field];
  if (field.dependsOn.equals !== undefined) {
    return current === field.dependsOn.equals;
  }
  return Boolean(current);
}

function isEmptyValue(field: RequestFormFieldDefinition, value: unknown): boolean {
  if (field.type === "checkbox") return value !== true;
  if (field.type === "multi_select") return !Array.isArray(value) || value.length === 0;
  if (field.type === "file") return value == null;
  if (typeof value === "string") return value.trim() === "";
  if (value && typeof value === "object" && "_filePlaceholder" in (value as object)) {
    return false;
  }
  return value == null || value === "";
}

function formatFieldValue(field: RequestFormFieldDefinition, value: unknown): string {
  if (field.type === "checkbox") return value === true ? "نعم" : "لا";
  if (field.type === "file") {
    if (value && typeof value === "object" && "_filePlaceholder" in (value as object)) {
      const ph = value as { name?: string };
      return ph.name ? `مرفق: ${ph.name}` : "مرفق";
    }
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

function safeDisplayText(raw: string): string {
  return raw.replace(/[<>&]/g, (ch) => ({ "<": "‹", ">": "›", "&": "＆" }[ch] ?? ch));
}

export function StudentRequestFormDataView({
  requestTypeCode,
  formData,
}: {
  requestTypeCode: string;
  formData: Record<string, unknown>;
}) {
  const def = getStudentRequestFormDefinition(requestTypeCode);
  const knownFieldNames = new Set<string>();

  const rows: { label: string; value: string; section?: string }[] = [];

  if (def) {
    for (const section of def.sections) {
      for (const field of section.fields) {
        if (field.type === "info" || field.type === "readonly") continue;
        if (!fieldVisible(field, formData)) continue;
        const value = formData[field.name];
        if (isEmptyValue(field, value)) continue;
        knownFieldNames.add(field.name);
        rows.push({
          label: field.labelAr,
          value: safeDisplayText(formatFieldValue(field, value)),
          section: section.titleAr,
        });
      }
    }
  }

  const unknownEntries = Object.entries(formData).filter(([key, val]) => {
    if (knownFieldNames.has(key)) return false;
    if (val == null || val === "") return false;
    if (typeof val === "object" && Object.keys(val as object).length === 0) return false;
    return true;
  });

  if (rows.length === 0 && unknownEntries.length === 0) {
    return (
      <div className="text-xs text-muted-foreground border border-dashed rounded-lg p-3 text-center">
        لا توجد بيانات نموذج مُدخلة.
      </div>
    );
  }

  let lastSection: string | undefined;

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="rounded-lg border bg-muted/10 divide-y">
          {rows.map((row, idx) => {
            const showSection = row.section && row.section !== lastSection;
            if (showSection) lastSection = row.section;
            return (
              <div key={`${row.label}-${idx}`}>
                {showSection && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-muted-foreground">
                    {row.section}
                  </div>
                )}
                <div className="flex items-baseline gap-2 px-3 py-2 text-xs">
                  <div className="text-muted-foreground w-36 shrink-0">{row.label}:</div>
                  <div className="font-semibold whitespace-pre-wrap break-words">{row.value}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {unknownEntries.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <div className="text-[11px] font-bold text-amber-900 mb-2">بيانات إضافية</div>
          <div className="space-y-1.5">
            {unknownEntries.map(([key, val]) => (
              <div key={key} className="flex items-baseline gap-2 text-xs">
                <div className="text-muted-foreground w-36 shrink-0 font-mono text-[10px]">
                  {safeDisplayText(key)}:
                </div>
                <div className="font-semibold whitespace-pre-wrap break-words">
                  {safeDisplayText(
                    typeof val === "object" ? JSON.stringify(val) : String(val),
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
