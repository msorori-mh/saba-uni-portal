import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ListChecks, Power, Paperclip, Plus, Pencil, Trash2, GitBranch } from "lucide-react";
import { toast } from "sonner";
import {
  listRequestTypes,
  toggleRequestTypeActive,
  upsertRequestType,
  deleteRequestType,
} from "@/lib/admin-request-types.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/request-types")({
  component: AdminRequestTypesPage,
});

type RT = {
  id: string; code: string; name_ar: string; description_ar: string | null;
  is_active: boolean; requires_attachment: boolean; sort_order: number;
};

type FormState = {
  id?: string;
  code: string;
  name_ar: string;
  description_ar: string;
  is_active: boolean;
  requires_attachment: boolean;
  sort_order: number;
};

const emptyForm: FormState = {
  code: "", name_ar: "", description_ar: "",
  is_active: true, requires_attachment: false, sort_order: 0,
};

function AdminRequestTypesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRequestTypes);
  const toggleFn = useServerFn(toggleRequestTypeActive);
  const upsertFn = useServerFn(upsertRequestType);
  const deleteFn = useServerFn(deleteRequestType);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["admin-request-types"],
    queryFn: () => listFn({ data: {} }),
  });

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
    setForm({ ...emptyForm, sort_order: nextOrder });
    setOpen(true);
  };

  const openEdit = (t: RT) => {
    setForm({
      id: t.id,
      code: t.code,
      name_ar: t.name_ar,
      description_ar: t.description_ar ?? "",
      is_active: t.is_active,
      requires_attachment: t.requires_attachment,
      sort_order: t.sort_order,
    });
    setOpen(true);
  };

  const save = async () => {
    const code = form.code.trim().toLowerCase().replace(/\s+/g, "_");
    const name_ar = form.name_ar.trim();
    if (!code || !name_ar) {
      toast.error("الكود والاسم العربي مطلوبان");
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(code)) {
      toast.error("الكود يجب أن يبدأ بحرف ويحتوي على حروف صغيرة وأرقام و _ فقط");
      return;
    }
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: form.id,
          code,
          name_ar,
          description_ar: form.description_ar,
          is_active: form.is_active,
          requires_attachment: form.requires_attachment,
          sort_order: form.sort_order,
        },
      });
      toast.success(form.id ? "تم تحديث نوع الطلب" : "تم إضافة نوع الطلب");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-request-types"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: RT) => {
    if (!confirm(`حذف نوع الطلب "${t.name_ar}"؟ لن يكون متاحًا للطلاب بعد ذلك.`)) return;
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
          <h1 className="font-display text-xl font-extrabold text-primary">أنواع الطلبات الطلابية</h1>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> إضافة نوع طلب
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        يمكن تفعيل أو تعطيل أي نوع من أنواع الطلبات. الأنواع المعطلة لا تظهر للطلاب كخدمة قابلة للاستخدام.
      </p>

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden divide-y">
          {types.map((t) => (
            <div key={t.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-bold text-sm text-primary">{t.name_ar}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{t.code}</span>
                  {t.requires_attachment && (
                    <span className="text-[10px] inline-flex items-center gap-0.5 bg-muted px-1.5 py-0.5 rounded">
                      <Paperclip className="h-2.5 w-2.5" /> يتطلب مرفق
                    </span>
                  )}
                </div>
                {t.description_ar && <div className="text-xs text-muted-foreground mt-0.5">{t.description_ar}</div>}
              </div>
              <div className="flex items-center gap-1.5">
                <Link
                  to="/admin/request-types/$id/workflow"
                  params={{ id: t.id }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-bold bg-primary/10 text-primary hover:bg-primary/15"
                  title="إعداد دورة الحياة"
                >
                  <GitBranch className="h-3 w-3" /> إعداد دورة الحياة
                </Link>
                <button
                  onClick={() => openEdit(t)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-muted text-muted-foreground"
                  title="تعديل"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => remove(t)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-destructive/10 text-destructive"
                  title="حذف"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => toggle(t.id, t.is_active)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold ${
                    t.is_active ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Power className="h-3 w-3" /> {t.is_active ? "مفعل" : "معطل"}
                </button>
              </div>
            </div>
          ))}
          {types.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">لا توجد أنواع طلبات. أضف نوعًا جديدًا.</div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "تعديل نوع طلب" : "إضافة نوع طلب جديد"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>الكود (إنجليزي) *</Label>
              <Input
                dir="ltr"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. course_withdrawal"
                disabled={!!form.id}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                حروف صغيرة وأرقام و _ فقط. لا يمكن تعديله بعد الإنشاء.
              </p>
            </div>
            <div>
              <Label>الاسم بالعربية *</Label>
              <Input
                value={form.name_ar}
                onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                placeholder="مثال: انسحاب من مقرر"
              />
            </div>
            <div>
              <Label>الوصف</Label>
              <Textarea
                value={form.description_ar}
                onChange={(e) => setForm({ ...form, description_ar: e.target.value })}
                rows={2}
                placeholder="وصف مختصر يظهر للطالب"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ترتيب العرض</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">يتطلب مرفقًا</Label>
                  <Switch
                    checked={form.requires_attachment}
                    onCheckedChange={(v) => setForm({ ...form, requires_attachment: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">مفعل</Label>
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded">
              ملاحظة: الأنواع المضافة هنا تظهر للطلاب كنوع طلب عام. الأنواع التي تحتاج نموذجًا خاصًا (تفاصيل إضافية)
              تحتاج تطويرًا تقنيًا لاحقًا لربط الحقول التفصيلية بها.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>إلغاء</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              {form.id ? "حفظ التعديلات" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
