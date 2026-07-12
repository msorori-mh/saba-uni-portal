import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  createRequestProcessingRole,
  deleteRequestProcessingRoleSafely,
  getRequestProcessingRoleUsage,
  listRequestProcessingRolesForAdmin,
  setRequestProcessingRoleActive,
  updateRequestProcessingRole,
} from "@/lib/admin-processing-roles.functions";

type ProcessingRoleRow = {
  id: string;
  code: string;
  unit_id: string;
  unit_code: string | null;
  unit_name_ar: string | null;
  unit_is_active: boolean | null;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  is_managerial: boolean;
  app_role: string | null;
  position_code: string | null;
  sort_order: number;
  is_active: boolean;
  workflowStepsCount: number;
  assignmentsCount: number;
};

type ProcessingUnitOption = {
  id: string;
  code: string | null;
  name_ar: string | null;
  is_active: boolean | null;
};

const appRoleOptions = [
  "admin",
  "editor",
  "viewer",
  "system_admin",
  "dean",
  "department_head",
  "registrar",
  "student_affairs",
  "finance_officer",
  "faculty_member",
  "student",
  "graduate",
  "hr_officer",
];

const emptyForm = {
  code: "",
  name_ar: "",
  name_en: "",
  description_ar: "",
  unit_id: "",
  is_managerial: false,
  app_role: "none",
  position_code: "",
  sort_order: 0,
  is_active: true,
};

export function roleDeleteConfirmationMatches(code: string, confirmationText: string) {
  return confirmationText.trim() === code.trim();
}

export function ProcessingRolesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRequestProcessingRolesForAdmin);
  const setActiveFn = useServerFn(setRequestProcessingRoleActive);
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [formRole, setFormRole] = useState<ProcessingRoleRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [usageRole, setUsageRole] = useState<ProcessingRoleRow | null>(null);
  const [busyToggle, setBusyToggle] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-processing-roles"],
    queryFn: () => listFn(),
  });
  const roles = data?.roles ?? [];
  const units = useMemo(() => {
    const rows = (data?.units ?? []) as ProcessingUnitOption[];
    return [...rows].sort((a, b) =>
      (a.name_ar ?? a.code ?? "").localeCompare(b.name_ar ?? b.code ?? "", "ar"),
    );
  }, [data?.units]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (roles as ProcessingRoleRow[]).filter((role) => {
      if (unitFilter !== "all" && role.unit_id !== unitFilter) return false;
      if (statusFilter === "active" && !role.is_active) return false;
      if (statusFilter === "inactive" && role.is_active) return false;
      if (q && !`${role.name_ar} ${role.code}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [roles, search, unitFilter, statusFilter]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-processing-roles"] });

  const toggleActive = async (role: ProcessingRoleRow) => {
    setBusyToggle(role.id);
    try {
      const res = await setActiveFn({ data: { id: role.id, is_active: !role.is_active } });
      toast.success(role.is_active ? "تم تعطيل الدور الوظيفي" : "تم تفعيل الدور الوظيفي");
      if (res.warning) toast.warning(res.warning);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تغيير حالة الدور");
    } finally {
      setBusyToggle(null);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-extrabold text-primary">الأدوار الوظيفية</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              إدارة مسميات معالجة الطلبات وربطها بجهات المعالجة وصلاحيات النظام.
            </p>
          </div>
          <Button onClick={() => { setFormRole(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> إضافة دور وظيفي
          </Button>
        </div>

        <div className="rounded-xl bg-card border border-border p-4 shadow-card">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الرمز..."
                className="w-full rounded-lg border border-border bg-background pr-10 px-3 py-2 text-sm"
              />
            </div>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">كل جهات المعالجة</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name_ar ?? unit.code ?? unit.id}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="inactive">معطّل</option>
            </select>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
          {isLoading ? (
            <div className="p-12 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              لا توجد أدوار مطابقة للفلاتر الحالية. يمكنك تعديل الفلاتر أو إضافة دور وظيفي جديد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-primary">
                  <tr>
                    <th className="px-4 py-3 text-right font-bold">الاسم</th>
                    <th className="px-4 py-3 text-right font-bold">الرمز</th>
                    <th className="px-4 py-3 text-right font-bold">الوحدة</th>
                    <th className="px-4 py-3 text-right font-bold">اسم الوحدة</th>
                    <th className="px-4 py-3 text-right font-bold">إداري</th>
                    <th className="px-4 py-3 text-right font-bold">app_role</th>
                    <th className="px-4 py-3 text-right font-bold">position_code</th>
                    <th className="px-4 py-3 text-right font-bold">الترتيب</th>
                    <th className="px-4 py-3 text-right font-bold">الحالة</th>
                    <th className="px-4 py-3 text-right font-bold">خطوات workflow</th>
                    <th className="px-4 py-3 text-right font-bold">التكليفات</th>
                    <th className="px-4 py-3 text-right font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((role) => (
                    <tr key={role.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-3 font-bold">{role.name_ar}</td>
                      <td className="px-4 py-3 font-mono text-xs" dir="ltr">{role.code}</td>
                      <td className="px-4 py-3 font-mono text-xs" dir="ltr">{role.unit_code ?? role.unit_id}</td>
                      <td className="px-4 py-3 text-xs">{role.unit_name_ar ?? "—"}</td>
                      <td className="px-4 py-3">
                        {role.is_managerial ? <Badge>إداري</Badge> : <Badge variant="outline">غير إداري</Badge>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" dir="ltr">{role.app_role ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs" dir="ltr">{role.position_code ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{role.sort_order}</td>
                      <td className="px-4 py-3">
                        <Badge variant={role.is_active ? "secondary" : "destructive"}>
                          {role.is_active ? "نشط" : "معطّل"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{role.workflowStepsCount}</td>
                      <td className="px-4 py-3 font-mono text-xs">{role.assignmentsCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Button variant="outline" size="sm" onClick={() => { setFormRole(role); setFormOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" /> تعديل
                          </Button>
                          <Button variant="outline" size="sm" disabled={busyToggle === role.id} onClick={() => toggleActive(role)}>
                            {busyToggle === role.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                            {role.is_active ? "تعطيل" : "تفعيل"}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setUsageRole(role)}>
                            <Trash2 className="h-3.5 w-3.5" /> الاستخدام/الحذف
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {formOpen && (
          <ProcessingRoleFormDialog
            open={formOpen}
            role={formRole}
            roles={roles as ProcessingRoleRow[]}
            units={units}
            onOpenChange={setFormOpen}
            onSaved={() => {
              setFormOpen(false);
              setFormRole(null);
              refresh();
            }}
          />
        )}

        {usageRole && (
          <ProcessingRoleUsageDeleteDialog
            role={usageRole}
            open={Boolean(usageRole)}
            onOpenChange={(open) => { if (!open) setUsageRole(null); }}
            onDeleted={() => {
              setUsageRole(null);
              refresh();
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

function ProcessingRoleFormDialog({
  open,
  role,
  roles,
  units,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  role: ProcessingRoleRow | null;
  roles: ProcessingRoleRow[];
  units: ProcessingUnitOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const createFn = useServerFn(createRequestProcessingRole);
  const updateFn = useServerFn(updateRequestProcessingRole);
  const usageFn = useServerFn(getRequestProcessingRoleUsage);
  const [form, setForm] = useState(() => role ? {
    code: role.code,
    name_ar: role.name_ar,
    name_en: role.name_en ?? "",
    description_ar: role.description_ar ?? "",
    unit_id: role.unit_id,
    is_managerial: role.is_managerial,
    app_role: role.app_role ?? "none",
    position_code: role.position_code ?? "",
    sort_order: role.sort_order,
    is_active: role.is_active,
  } : {
    ...emptyForm,
    unit_id: units.find((unit) => unit.is_active !== false)?.id ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const usageQuery = useQuery({
    queryKey: ["admin-processing-role-usage", role?.id],
    queryFn: () => usageFn({ data: { id: role!.id } }),
    enabled: open && Boolean(role),
  });

  const unitChanged = Boolean(role && form.unit_id !== role.unit_id);
  const changeUnitBlocked = Boolean(role && usageQuery.data && !usageQuery.data.changeUnitSafety.allowed);
  const unitSelectDisabled = Boolean(role && (usageQuery.isLoading || changeUnitBlocked));

  const update = (key: keyof typeof form, value: any) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.unit_id) {
      setErr("يجب اختيار جهة معالجة قبل الحفظ.");
      return;
    }
    if (unitChanged && changeUnitBlocked) {
      setErr(usageQuery.data?.changeUnitSafety.reasons[0] ?? "لا يمكن تغيير جهة المعالجة لهذا الدور بسبب استخدامات مرتبطة.");
      return;
    }
    setBusy(true);
    setErr(null);
    const payload = {
      name_ar: form.name_ar,
      name_en: form.name_en || null,
      description_ar: form.description_ar || null,
      unit_id: form.unit_id,
      is_managerial: form.is_managerial,
      app_role: form.app_role === "none" ? null : form.app_role,
      position_code: form.position_code || null,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    };
    try {
      if (role) {
        const res = await updateFn({ data: { id: role.id, ...payload } });
        toast.success("تم تحديث الدور الوظيفي");
        if (res.warning) toast.warning(res.warning);
      } else {
        const res = await createFn({ data: { code: form.code, ...payload } });
        toast.success("تم إنشاء الدور الوظيفي");
        if (res.warning) toast.warning(res.warning);
      }
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذّر حفظ الدور الوظيفي";
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-right">
          <DialogTitle>{role ? "تعديل دور وظيفي" : "إضافة دور وظيفي"}</DialogTitle>
          <DialogDescription className="text-right">
            رمز الدور ثابت بعد الإنشاء، وتغيير جهة المعالجة يُمنع عند وجود استخدامات مرتبطة.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label="الرمز *">
              <input
                required
                disabled={Boolean(role)}
                dir="ltr"
                value={form.code}
                onChange={(e) => update("code", e.target.value.toLowerCase())}
                placeholder="registrar_general"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono disabled:bg-muted"
              />
            </LabeledInput>
            <LabeledInput label="الاسم بالعربية *">
              <input
                required
                value={form.name_ar}
                onChange={(e) => update("name_ar", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </LabeledInput>
            <LabeledInput label="الاسم بالإنجليزية">
              <input
                dir="ltr"
                value={form.name_en}
                onChange={(e) => update("name_en", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </LabeledInput>
            <LabeledInput label="جهة المعالجة *">
              <select
                required
                disabled={unitSelectDisabled}
                value={form.unit_id}
                onChange={(e) => update("unit_id", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:bg-muted"
              >
                <option value="">اختر جهة المعالجة</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id} disabled={unit.is_active === false}>
                    {unit.name_ar ?? unit.code ?? unit.id}
                  </option>
                ))}
              </select>
            </LabeledInput>
            <LabeledInput label="app_role">
              <select
                value={form.app_role}
                onChange={(e) => update("app_role", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="none">بدون</option>
                {appRoleOptions.map((roleOption) => <option key={roleOption} value={roleOption}>{roleOption}</option>)}
              </select>
            </LabeledInput>
            <LabeledInput label="position_code">
              <input
                dir="ltr"
                value={form.position_code}
                onChange={(e) => update("position_code", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </LabeledInput>
            <LabeledInput label="الترتيب">
              <input
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) => update("sort_order", Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </LabeledInput>
            <LabeledInput label="الحالة">
              <select
                value={form.is_active ? "active" : "inactive"}
                onChange={(e) => update("is_active", e.target.value === "active")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="active">نشط</option>
                <option value="inactive">معطّل</option>
              </select>
            </LabeledInput>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3 text-sm">
            <input
              type="checkbox"
              checked={form.is_managerial}
              onChange={(e) => update("is_managerial", e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-bold text-primary">دور إداري/مديري</span>
              <span className="block text-xs text-muted-foreground">يعرض شارة إدارية ويستخدم للتمييز في سير معالجة الطلبات.</span>
            </span>
          </label>

          <LabeledInput label="الوصف">
            <textarea
              value={form.description_ar}
              onChange={(e) => update("description_ar", e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </LabeledInput>

          {changeUnitBlocked && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
              لا يمكن تغيير جهة المعالجة لهذا الدور: {usageQuery.data?.changeUnitSafety.reasons.join(" ")}
            </div>
          )}
          {roles.length === 0 && units.length === 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
              لا توجد جهات معالجة ظاهرة من البيانات الحالية. يلزم وجود جهة معالجة نشطة قبل إنشاء دور جديد.
            </div>
          )}
          {err && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">{err}</div>}

          <DialogFooter className="gap-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={busy || !form.unit_id}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProcessingRoleUsageDeleteDialog({
  role,
  open,
  onOpenChange,
  onDeleted,
}: {
  role: ProcessingRoleRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const usageFn = useServerFn(getRequestProcessingRoleUsage);
  const deleteFn = useServerFn(deleteRequestProcessingRoleSafely);
  const [confirmationText, setConfirmationText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const usageQuery = useQuery({
    queryKey: ["admin-processing-role-usage", role.id],
    queryFn: () => usageFn({ data: { id: role.id } }),
    enabled: open,
  });

  const deleteSafety = usageQuery.data?.deleteSafety;
  const deleteBlockedReason = deleteSafety?.reasons.join(" ") || "لا يمكن الحذف قبل اكتمال فحص الاستخدام.";
  const canDelete = Boolean(deleteSafety?.allowed) && roleDeleteConfirmationMatches(role.code, confirmationText);

  const handleDelete = async () => {
    if (!canDelete) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await deleteFn({ data: { id: role.id, confirmationText } });
      toast.success(res.messageAr ?? "تم حذف الدور الوظيفي");
      if (res.warning) toast.warning(res.warning);
      onDeleted();
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذّر حذف الدور الوظيفي";
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-right">
          <DialogTitle>استخدامات الدور وحذفه</DialogTitle>
          <DialogDescription className="text-right">
            راجع الارتباطات قبل حذف الدور. يجب كتابة الرمز تماماً لتأكيد الحذف.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/30 p-3 text-sm">
            <div className="font-bold text-primary">{role.name_ar}</div>
            <div className="mt-1 font-mono text-xs" dir="ltr">{role.code}</div>
          </div>

          {usageQuery.isLoading ? (
            <div className="p-8 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : usageQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
              {usageQuery.error instanceof Error ? usageQuery.error.message : "تعذّر فحص الاستخدام"}
            </div>
          ) : usageQuery.data ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <UsageCount label="خطوات workflow" value={usageQuery.data.usage.workflowStepsCount} />
                <UsageCount label="التكليفات" value={usageQuery.data.usage.assignmentsCount} />
                <UsageCount label="أخطاء الفحص" value={usageQuery.data.usage.queryFailures.length} />
              </div>
              {deleteSafety && !deleteSafety.allowed && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
                  <div className="font-bold">لا يمكن حذف هذا الدور حالياً:</div>
                  <ul className="mt-2 list-disc space-y-1 pr-5">
                    {deleteSafety.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                </div>
              )}
              {deleteSafety?.allowed && (
                <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div className="text-sm font-bold text-destructive">اكتب رمز الدور لتأكيد الحذف:</div>
                  <input
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder={role.code}
                    dir="ltr"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
              )}
            </>
          ) : null}

          {err && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">{err}</div>}
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button type="button" variant="destructive" disabled={!canDelete || busy} onClick={handleDelete}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  حذف الدور
                </Button>
              </span>
            </TooltipTrigger>
            {!canDelete && <TooltipContent>{deleteSafety?.allowed ? "اكتب الرمز تماماً لتأكيد الحذف" : deleteBlockedReason}</TooltipContent>}
          </Tooltip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LabeledInput({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-bold text-primary">{label}</span>
      {children}
    </label>
  );
}

function UsageCount({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-base font-bold">{value ?? "تعذّر الفحص"}</div>
    </div>
  );
}
