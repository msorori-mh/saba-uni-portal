import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { addPositionRole, removePositionRole } from "@/lib/org-structure.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CatalogRole = { code: string; name_ar: string; app_role_mapping: string | null; is_active: boolean };
export type PositionMapping = {
  id: string; position_id: string; role_code: string; is_active: boolean;
  roles_catalog?: { name_ar?: string; app_role_mapping?: string | null } | null;
};

export function OrgPositionRolesDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: { id: string; name_ar: string } | null;
  mappings: PositionMapping[];
  roles: CatalogRole[];
}) {
  const { open, onOpenChange, position, mappings, roles } = props;
  const qc = useQueryClient();
  const addFn = useServerFn(addPositionRole);
  const removeFn = useServerFn(removePositionRole);
  const [picked, setPicked] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["org-structure"] });

  const addMut = useMutation({
    mutationFn: () => addFn({ data: { position_id: position!.id, role_code: picked } }),
    onSuccess: () => { toast.success("تم ربط الدور بالمنصب"); setPicked(""); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر الربط"),
  });

  const removeMut = useMutation({
    mutationFn: (mapping_id: string) => removeFn({ data: { mapping_id } }),
    onSuccess: () => { toast.success("تم إلغاء ربط الدور"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر الإلغاء"),
  });

  const current = mappings.filter((m) => m.position_id === position?.id);
  const available = roles.filter(
    (r) => r.is_active && !current.some((m) => m.role_code === r.code),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>أدوار المنصب: {position?.name_ar}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            كل دور مرتبط بهذا المنصب يُمنح تلقائياً لشاغله الحالي، ويُسحب تلقائياً عند إنهاء التعيين.
          </p>

          <div className="space-y-2">
            {current.length === 0 && (
              <div className="text-sm text-muted-foreground">لا توجد أدوار مرتبطة بهذا المنصب.</div>
            )}
            {current.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border p-2">
                <div>
                  <div className="text-sm font-medium">{m.roles_catalog?.name_ar ?? m.role_code}</div>
                  <div className="text-xs text-muted-foreground font-mono">{m.role_code}</div>
                  {m.roles_catalog?.app_role_mapping ? (
                    <Badge variant="secondary" className="mt-1 text-[10px]">
                      دور تشغيلي: {m.roles_catalog.app_role_mapping}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="mt-1 text-[10px]">وصفي فقط — لا يمنح صلاحيات</Badge>
                  )}
                </div>
                <Button
                  size="sm" variant="ghost" className="text-destructive"
                  disabled={removeMut.isPending}
                  onClick={() => removeMut.mutate(m.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-end gap-2 border-t pt-3">
            <div className="flex-1">
              <label className="text-sm font-medium block mb-1">إضافة دور</label>
              <Select value={picked} onValueChange={setPicked}>
                <SelectTrigger><SelectValue placeholder="اختر دوراً من الكتالوج" /></SelectTrigger>
                <SelectContent>
                  {available.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.name_ar} {r.app_role_mapping ? `(${r.app_role_mapping})` : "(وصفي)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!picked || addMut.isPending} onClick={() => addMut.mutate()}>
              {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
