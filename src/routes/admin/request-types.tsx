import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  ListChecks,
  Power,
  Paperclip,
  Plus,
  Pencil,
  Trash2,
  GitBranch,
  Eye,
  EyeOff,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  listRequestTypes,
  toggleRequestTypeActive,
  upsertRequestType,
  deleteRequestType,
  type RequestTypeAdminRow,
} from "@/lib/admin-request-types.functions";
import {
  RequestTypeConfigDialog,
  emptyRequestTypeConfigForm,
  type RequestTypeConfigFormState,
} from "@/components/admin/RequestTypeConfigDialog";
import { Button } from "@/components/ui/button";
import {
  INELIGIBLE_DISPLAY_MODE_LABELS_AR,
  REQUEST_AUDIENCE_LABELS_AR,
  getRegistryDefaultsForAdminForm,
  getStudentRequestTypeDisplayName,
  isLegacyAliasCode,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";

export const Route = createFileRoute("/admin/request-types")({
  component: AdminRequestTypesPage,
});

function rowToForm(t: RequestTypeAdminRow): RequestTypeConfigFormState {
  const registry = getRegistryDefaultsForAdminForm(t.code);
  return {
    id: t.id,
    code: t.code,
    name_ar: t.name_ar,
    description_ar: t.description_ar ?? "",
    request_audience: t.request_audience ?? registry?.request_audience ?? "active_student",
    ineligible_display_mode:
      t.ineligible_display_mode ?? registry?.ineligible_display_mode ?? "hidden",
    student_visible: t.student_visible,
    is_active: t.is_active,
    requires_attachment: t.requires_attachment,
    requires_service_window: registry?.requires_service_window ?? false,
    requires_fee: registry?.requires_fee ?? false,
    produces_document: registry?.produces_document ?? false,
    requires_archive: registry?.requires_archive ?? false,
    sort_order: t.sort_order,
  };
}

function AdminRequestTypesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRequestTypes);
  const toggleFn = useServerFn(toggleRequestTypeActive);
  const upsertFn = useServerFn(upsertRequestType);
  const deleteFn = useServerFn(deleteRequestType);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RequestTypeConfigFormState>(emptyRequestTypeConfigForm());
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-request-types"],
    queryFn: () => listFn({ data: {} }),
  });

  const types = data?.types ?? [];
  const capabilities = data?.capabilities ?? {
    hasAudienceFields: false,
    hasStudentVisible: false,
  };

  const existingCodes = useMemo(() => types.map((t) => t.code), [types]);

  const toggle = async (id: string, current: boolean) => {
    try {
      await toggleFn({ data: { id, isActive: !current } });
      toast.success(!current ? "تم التفعيل" : "تم التعطيل");
      qc.invalidateQueries({ queryKey: ["admin-request-types"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التحديث");
    }
  };

  const openCreate = () => {
    const nextOrder = (types.reduce((m, t) => Math.max(m, t.sort_order), 0) || 0) + 1;
    setForm(emptyRequestTypeConfigForm(nextOrder));
    setOpen(true);
  };

  const openEdit = (t: RequestTypeAdminRow) => {
    setForm(rowToForm(t));
    setOpen(true);
  };

  const save = async () => {
    const code = form.code.trim().toLowerCase().replace(/\s+/g, "_");
    const name_ar = form.name_ar.trim();
    if (!code || !name_ar) {
      toast.error("الكود والاسم العربي مطلوبان");
      return;
    }
    if (!form.id && isLegacyAliasCode(code)) {
      toast.error("لا يمكن إنشاء نوع بكود legacy");
      return;
    }

    setSaving(true);
    try {
      const result = await upsertFn({
        data: {
          id: form.id,
          code,
          name_ar,
          description_ar: form.description_ar,
          is_active: form.is_active,
          requires_attachment: form.requires_attachment,
          sort_order: form.sort_order,
          student_visible: form.student_visible,
          request_audience: form.request_audience,
          ineligible_display_mode: form.ineligible_display_mode,
        },
      });

      const parts = [form.id ? "تم تحديث نوع الطلب" : "تم إضافة نوع الطلب"];
      if (!result.savedAudienceFields && !capabilities.hasAudienceFields) {
        parts.push("— الحقول الأساسية فقط (جمهور/أهلية غير محفوظة)");
      } else if (!result.savedAudienceFields) {
        parts.push("— لم تُحفظ إعدادات الجمهور");
      }
      toast.success(parts.join(" "));
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-request-types"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: RequestTypeAdminRow) => {
    const label = getStudentRequestTypeDisplayName(t.code, t.name_ar);
    if (!confirm(`حذف نوع الطلب "${label}"؟ لن يكون متاحًا للطلاب بعد ذلك.`)) return;
    try {
      await deleteFn({ data: { id: t.id } });
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["admin-request-types"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحذف");
    }
  };

  return (
    <div dir="rtl" className="p-4 lg:p-8 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-gold" />
          <h1 className="font-display text-xl font-extrabold text-primary">أنواع الخدمات الطلابية</h1>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> إضافة نوع طلب
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        إعداد أنواع الطلبات وفق المواصفة المعتمدة. دورة الحياة (الخطوات والجهات) تُدار منفصلة عبر «إعداد دورة
        الحياة». الأنواع المعطلة لا تظهر للطلاب كخدمة قابلة للاستخدام.
      </p>

      {!capabilities.hasAudienceFields && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          إعدادات الجمهور والأهلية تحتاج تطبيق مخطط طلبات الطلاب قبل الحفظ. يمكنك حالياً تعديل الحقول
          الأساسية (الاسم، الوصف، المرفقات، التفعيل، الترتيب).
        </div>
      )}

      {isLoading ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden divide-y">
          {types.map((t) => (
            <RequestTypeListRow
              key={t.id}
              row={t}
              capabilities={capabilities}
              onEdit={() => openEdit(t)}
              onRemove={() => remove(t)}
              onToggle={() => toggle(t.id, t.is_active)}
            />
          ))}
          {types.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              لا توجد أنواع طلبات. أضف نوعًا جديدًا من القائمة المعتمدة.
            </div>
          )}
        </div>
      )}

      <RequestTypeConfigDialog
        open={open}
        onOpenChange={setOpen}
        form={form}
        onFormChange={setForm}
        existingCodes={existingCodes}
        capabilities={capabilities}
        saving={saving}
        onSave={save}
      />
    </div>
  );
}

function RequestTypeListRow({
  row,
  capabilities,
  onEdit,
  onRemove,
  onToggle,
}: {
  row: RequestTypeAdminRow;
  capabilities: { hasAudienceFields: boolean; hasStudentVisible: boolean };
  onEdit: () => void;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const displayName = getStudentRequestTypeDisplayName(row.code, row.name_ar);
  const canonical = normalizeStudentRequestTypeCode(row.code);
  const isLegacy = isLegacyAliasCode(row.code);
  const registry = getRegistryDefaultsForAdminForm(row.code);
  const audience = row.request_audience ?? registry?.request_audience;
  const ineligible = row.ineligible_display_mode ?? registry?.ineligible_display_mode;

  return (
    <div className="p-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-bold text-sm text-primary">{displayName}</span>
          <span className="text-[10px] font-mono text-muted-foreground">{row.code}</span>
          {isLegacy && canonical !== row.code && (
            <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
              → {canonical}
            </span>
          )}
          {row.requires_attachment && (
            <span className="text-[10px] inline-flex items-center gap-0.5 bg-muted px-1.5 py-0.5 rounded">
              <Paperclip className="h-2.5 w-2.5" /> مرفق
            </span>
          )}
          {capabilities.hasStudentVisible && (
            <span className="text-[10px] inline-flex items-center gap-0.5 bg-muted px-1.5 py-0.5 rounded">
              {row.student_visible ? (
                <><Eye className="h-2.5 w-2.5" /> ظاهر للطالب</>
              ) : (
                <><EyeOff className="h-2.5 w-2.5" /> مخفي عن الطالب</>
              )}
            </span>
          )}
          {audience && (
            <span className="text-[10px] inline-flex items-center gap-0.5 bg-blue-50 text-blue-900 px-1.5 py-0.5 rounded">
              <Users className="h-2.5 w-2.5" />
              {REQUEST_AUDIENCE_LABELS_AR[audience]}
              {!capabilities.hasAudienceFields && " (افتراضي)"}
            </span>
          )}
          {ineligible && (
            <span className="text-[10px] text-muted-foreground">
              غير مؤهل: {INELIGIBLE_DISPLAY_MODE_LABELS_AR[ineligible]}
            </span>
          )}
        </div>
        {row.description_ar && (
          <div className="text-xs text-muted-foreground mt-0.5">{row.description_ar}</div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Link
          to="/admin/request-types/$id/workflow"
          params={{ id: row.id }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-bold bg-primary/10 text-primary hover:bg-primary/15"
          title="إعداد دورة الحياة"
        >
          <GitBranch className="h-3 w-3" /> دورة الحياة
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-muted text-muted-foreground"
          title="تعديل"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-destructive/10 text-destructive"
          title="حذف"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold ${
            row.is_active ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
          }`}
        >
          <Power className="h-3 w-3" /> {row.is_active ? "مفعل" : "معطل"}
        </button>
      </div>
    </div>
  );
}
