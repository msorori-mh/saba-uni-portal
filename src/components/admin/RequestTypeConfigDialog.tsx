import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  INELIGIBLE_DISPLAY_MODE_LABELS_AR,
  REQUEST_AUDIENCE_LABELS_AR,
  buildAdminCreateTypeOptions,
  getRegistryDefaultsForAdminForm,
  getStudentRequestTypeDisplayName,
  isLegacyAliasCode,
  normalizeStudentRequestTypeCode,
  type IneligibleDisplayMode,
  type StudentRequestAudience,
} from "@/lib/student-requests/request-type-registry";

export type RequestTypeAdminSchemaCapabilities = {
  hasAudienceFields: boolean;
  hasStudentVisible: boolean;
};

export type RequestTypeConfigFormState = {
  id?: string;
  code: string;
  name_ar: string;
  description_ar: string;
  request_audience: StudentRequestAudience;
  ineligible_display_mode: IneligibleDisplayMode;
  student_visible: boolean;
  is_active: boolean;
  requires_attachment: boolean;
  requires_service_window: boolean;
  requires_fee: boolean;
  produces_document: boolean;
  requires_archive: boolean;
  sort_order: number;
};

export const emptyRequestTypeConfigForm = (sortOrder = 0): RequestTypeConfigFormState => ({
  code: "",
  name_ar: "",
  description_ar: "",
  request_audience: "active_student",
  ineligible_display_mode: "hidden",
  student_visible: true,
  is_active: true,
  requires_attachment: false,
  requires_service_window: false,
  requires_fee: false,
  produces_document: false,
  requires_archive: false,
  sort_order: sortOrder,
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: RequestTypeConfigFormState;
  onFormChange: (form: RequestTypeConfigFormState) => void;
  existingCodes: string[];
  capabilities: RequestTypeAdminSchemaCapabilities;
  saving: boolean;
  onSave: () => void;
};

const AUDIENCE_HELP =
  "طلبات الخريجين تظهر باهتة لغير الخريج عند «معطّل». طلبات الطلاب تختفي عن الخريج عند «مخفي». المنع الفعلي لاحقاً من RPC وليس من الواجهة فقط.";

const MIGRATION_MSG =
  "إعدادات الجمهور والأهلية تحتاج تطبيق مخطط طلبات الطلاب قبل الحفظ.";

const REGISTRY_ONLY_NOTE =
  "هذه الخصائص للمراجعة وفق المواصفة؛ لا تُخزَّن في قاعدة البيانات حتى مرحلة لاحقة.";

export function RequestTypeConfigDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  existingCodes,
  capabilities,
  saving,
  onSave,
}: Props) {
  const isEdit = !!form.id;
  const isLegacy = isLegacyAliasCode(form.code);
  const createOptions = buildAdminCreateTypeOptions(existingCodes);
  const displayCode = form.code
    ? normalizeStudentRequestTypeCode(form.code)
    : "";
  const canonicalLabel = form.code
    ? getStudentRequestTypeDisplayName(form.code, form.name_ar)
    : "";

  const applyCanonicalCode = (code: string) => {
    const defaults = getRegistryDefaultsForAdminForm(code);
    if (defaults) {
      onFormChange({
        ...form,
        code: defaults.code,
        name_ar: defaults.name_ar,
        description_ar: defaults.description_ar,
        request_audience: defaults.request_audience,
        ineligible_display_mode: defaults.ineligible_display_mode,
        student_visible: defaults.student_visible,
        requires_attachment: defaults.requires_attachment,
        requires_service_window: defaults.requires_service_window,
        requires_fee: defaults.requires_fee,
        produces_document: defaults.produces_document,
        requires_archive: defaults.requires_archive,
      });
    } else {
      onFormChange({ ...form, code });
    }
  };

  const audienceFieldsDisabled = !capabilities.hasAudienceFields;
  const canSaveAudienceFields = capabilities.hasAudienceFields;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل نوع طلب" : "إضافة نوع طلب جديد"}</DialogTitle>
        </DialogHeader>

        {!canSaveAudienceFields && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {MIGRATION_MSG}
          </div>
        )}

        <div className="grid gap-4">
          <div>
            <Label>الكود *</Label>
            {isEdit ? (
              <div className="mt-1 space-y-1">
                <Input dir="ltr" value={form.code} disabled className="font-mono text-sm" />
                {isLegacy && displayCode !== form.code && (
                  <p className="text-[11px] text-muted-foreground">
                    كود قديم — الاسم الرسمي: <strong>{canonicalLabel}</strong> ({displayCode})
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">لا يمكن تعديل الكود بعد الإنشاء.</p>
              </div>
            ) : createOptions.length > 0 ? (
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.code}
                onChange={(e) => applyCanonicalCode(e.target.value)}
              >
                <option value="">— اختر نوعاً معتمداً —</option>
                {createOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                جميع الأنواع المعتمدة موجودة بالفعل. يمكنك تعديل السجلات الحالية فقط.
              </p>
            )}
          </div>

          <div>
            <Label>الاسم بالعربية *</Label>
            <Input
              value={form.name_ar}
              onChange={(e) => onFormChange({ ...form, name_ar: e.target.value })}
              placeholder="مثال: وقف القيد"
            />
          </div>

          <div>
            <Label>الوصف العربي</Label>
            <Textarea
              value={form.description_ar}
              onChange={(e) => onFormChange({ ...form, description_ar: e.target.value })}
              rows={2}
              placeholder="وصف مختصر يظهر للطالب"
            />
          </div>

          <fieldset
            className={`rounded-lg border p-3 space-y-3 ${audienceFieldsDisabled ? "opacity-70" : ""}`}
            disabled={audienceFieldsDisabled}
          >
            <legend className="text-sm font-bold px-1">جمهور الطلب والأهلية</legend>
            <p className="text-[11px] text-muted-foreground">{AUDIENCE_HELP}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>جمهور الطلب</Label>
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.request_audience}
                  onChange={(e) =>
                    onFormChange({
                      ...form,
                      request_audience: e.target.value as StudentRequestAudience,
                    })
                  }
                >
                  {(Object.entries(REQUEST_AUDIENCE_LABELS_AR) as [StudentRequestAudience, string][]).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <Label>عرض غير المؤهل</Label>
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.ineligible_display_mode}
                  onChange={(e) =>
                    onFormChange({
                      ...form,
                      ineligible_display_mode: e.target.value as IneligibleDisplayMode,
                    })
                  }
                >
                  {(Object.entries(INELIGIBLE_DISPLAY_MODE_LABELS_AR) as [IneligibleDisplayMode, string][]).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
          </fieldset>

          <div className="grid sm:grid-cols-2 gap-3">
            <ToggleRow
              label="الخدمة ظاهرة للطالب"
              hint="student_visible"
              checked={form.student_visible}
              disabled={!capabilities.hasStudentVisible}
              onCheckedChange={(v) => onFormChange({ ...form, student_visible: v })}
            />
            <ToggleRow
              label="مفعّل"
              checked={form.is_active}
              onCheckedChange={(v) => onFormChange({ ...form, is_active: v })}
            />
            <ToggleRow
              label="يتطلب مرفقات"
              checked={form.requires_attachment}
              onCheckedChange={(v) => onFormChange({ ...form, requires_attachment: v })}
            />
            <div>
              <Label>ترتيب العرض</Label>
              <Input
                type="number"
                className="mt-1"
                value={form.sort_order}
                onChange={(e) =>
                  onFormChange({ ...form, sort_order: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <fieldset className="rounded-lg border border-dashed p-3 space-y-2">
            <legend className="text-sm font-bold px-1 text-muted-foreground">
              خصائص المواصفة (مراجعة)
            </legend>
            <p className="text-[10px] text-muted-foreground">{REGISTRY_ONLY_NOTE}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <ToggleRow
                label="يتطلب نافذة تفعيل"
                checked={form.requires_service_window}
                disabled
                onCheckedChange={(v) => onFormChange({ ...form, requires_service_window: v })}
              />
              <ToggleRow
                label="يتطلب رسوماً"
                checked={form.requires_fee}
                disabled
                onCheckedChange={(v) => onFormChange({ ...form, requires_fee: v })}
              />
              <ToggleRow
                label="ينتج مستنداً"
                checked={form.produces_document}
                disabled
                onCheckedChange={(v) => onFormChange({ ...form, produces_document: v })}
              />
              <ToggleRow
                label="يحتاج أرشفة"
                checked={form.requires_archive}
                disabled
                onCheckedChange={(v) => onFormChange({ ...form, requires_archive: v })}
              />
            </div>
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button
            onClick={onSave}
            disabled={
              saving
              || (!isEdit && !form.code)
              || (!isEdit && createOptions.length === 0)
            }
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            {isEdit ? "حفظ التعديلات" : "إضافة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div>
        <Label className="text-xs">{label}</Label>
        {hint && <div className="text-[9px] text-muted-foreground font-mono">{hint}</div>}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
