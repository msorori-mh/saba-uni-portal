import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createPosition, updatePosition } from "@/lib/org-structure.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type OrgPosition = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
  parent_code: string | null;
  unit_type: string;
  sort_order: number;
  department_id: string | null;
  notes: string | null;
  is_active: boolean;
};

const UNIT_TYPES = [
  { value: "position", label: "منصب" },
  { value: "department", label: "قسم أكاديمي" },
  { value: "unit", label: "وحدة" },
  { value: "administration", label: "إدارة" },
  { value: "council", label: "مجلس" },
  { value: "committee", label: "لجنة" },
];

export function OrgPositionDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: OrgPosition | null;
  positions: OrgPosition[];
  departments: Array<{ id: string; name_ar: string }>;
}) {
  const { open, onOpenChange, position, positions, departments } = props;
  const qc = useQueryClient();
  const createFn = useServerFn(createPosition);
  const updateFn = useServerFn(updatePosition);

  const [form, setForm] = useState({
    code: "", name_ar: "", name_en: "", parent_code: "", unit_type: "position",
    sort_order: 0, department_id: "", notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      code: position?.code ?? "",
      name_ar: position?.name_ar ?? "",
      name_en: position?.name_en ?? "",
      parent_code: position?.parent_code ?? "",
      unit_type: position?.unit_type ?? "position",
      sort_order: position?.sort_order ?? 0,
      department_id: position?.department_id ?? "",
      notes: position?.notes ?? "",
    });
  }, [open, position]);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        name_ar: form.name_ar.trim(),
        name_en: form.name_en.trim() || null,
        parent_code: form.parent_code || null,
        unit_type: form.unit_type,
        sort_order: Number(form.sort_order) || 0,
        department_id: form.department_id || null,
        notes: form.notes.trim() || null,
      };
      if (position) return updateFn({ data: { id: position.id, ...payload } as any });
      return createFn({ data: { code: form.code.trim(), ...payload } as any });
    },
    onSuccess: () => {
      toast.success(position ? "تم تحديث المنصب" : "تم إنشاء المنصب");
      qc.invalidateQueries({ queryKey: ["org-structure"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر الحفظ"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{position ? `تعديل المنصب: ${position.name_ar}` : "إنشاء منصب جديد"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto">
          <div>
            <label className="text-sm font-medium block mb-1">الكود</label>
            <Input
              value={form.code}
              disabled={!!position}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="head_cs_department"
            />
            {!position && (
              <p className="text-xs text-muted-foreground mt-1">حروف لاتينية صغيرة وأرقام و _ فقط، ولا يمكن تغييره لاحقاً.</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">الاسم بالعربية</label>
            <Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">الاسم بالإنجليزية (اختياري)</label>
            <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">النوع</label>
              <Select value={form.unit_type} onValueChange={(v) => setForm({ ...form, unit_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">الترتيب</label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">التبعية (المنصب الأعلى)</label>
            <Select
              value={form.parent_code || "__none__"}
              onValueChange={(v) => setForm({ ...form, parent_code: v === "__none__" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="بدون تبعية" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— بدون تبعية —</SelectItem>
                {positions
                  .filter((p) => !position || p.code !== position.code)
                  .map((p) => <SelectItem key={p.id} value={p.code}>{p.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">القسم المرتبط (اختياري)</label>
            <Select
              value={form.department_id || "__none__"}
              onValueChange={(v) => setForm({ ...form, department_id: v === "__none__" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="بدون قسم" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— بدون قسم —</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">ملاحظات</label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            disabled={mut.isPending || !form.name_ar.trim() || (!position && !form.code.trim())}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
