import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus, Search, Loader2, X, Pencil, KeyRound, UserCheck, UserX,
  Briefcase, Upload, Unlink, Trash2, ShieldOff, UsersRound,
} from "lucide-react";
import { listUsers, createAccount, resetPassword, setActive, removeLoginAccount } from "@/lib/admin-users.functions";
import { deactivateStaffProfile } from "@/lib/admin-staff-deletion.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffDeleteDialog } from "@/components/admin/staff-management/StaffDeleteDialog";
import { ProcessingRolesTab } from "@/components/admin/staff-management/ProcessingRolesTab";
import { EmployeeServicesShowcase } from "@/components/admin/staff-management/EmployeeServicesShowcase";
import { StaffSelfServiceLiveActions } from "@/components/staff-showcase/StaffSelfServiceLiveActions";
import { portalFeatures } from "@/lib/portal-features";

const UNLINK_LOGIN_CONFIRM =
  "سيتم فك ربط حساب الدخول فقط. لن يُحذف الملف الأكاديمي أو المالي أو الإداري. يمكن إنشاء حساب دخول جديد لاحقاً.\n\nهل تريد المتابعة؟";
import {
  getPeopleLookups, createStaffMember, updateStaffMember, getStaffMember,
} from "@/lib/admin-people.functions";
import { CredentialsSlip, Section, Field, useBusyError, type CredentialsSlipData } from "@/components/admin/people/shared";
import {
  StaffDepartmentScopeFields,
  type StaffDepartmentScope,
} from "@/components/admin/people/staff-department-scope";
import {
  staffRoleFormOptionsForCreate,
  staffRoleFilterOptions,
  staffFunctionalRoleLabel,
  staffFunctionalRoleDisplayLabel,
  staffRoleFormOptionsForEdit,
} from "@/lib/staff-functional-roles";

export const Route = createFileRoute("/admin/staff-management")({
  head: () => ({ meta: [{ title: "إدارة الموظفين — لوحة الإدارة" }] }),
  component: StaffManagementPage,
});

type Lookups = Awaited<ReturnType<typeof getPeopleLookups>>;

function roleTypeLabel(rt: string) {
  return staffFunctionalRoleDisplayLabel(rt);
}

function StaffManagementPage() {
  const [activeTab, setActiveTab] = useState("staff");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [roleType, setRoleType] = useState<string>("all");
  const [hasAccount, setHasAccount] = useState<"all" | "yes" | "no">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteStaff, setDeleteStaff] = useState<any | null>(null);
  const [slip, setSlip] = useState<CredentialsSlipData | null>(null);

  const list = useServerFn(listUsers);
  const create = useServerFn(createAccount);
  const reset = useServerFn(resetPassword);
  const toggle = useServerFn(setActive);
  const removeLogin = useServerFn(removeLoginAccount);
  const deactivateProfile = useServerFn(deactivateStaffProfile);
  const lookupsFn = useServerFn(getPeopleLookups);

  const qc = useQueryClient();
  const { busy, error, setError, run } = useBusyError();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-staff-management", search, status],
    queryFn: () => list({ data: { kind: "staff", search: search || undefined, status } }),
  });
  const { data: lookups } = useQuery({
    queryKey: ["admin-people-lookups"],
    queryFn: () => lookupsFn(),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-staff-management"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["people-stats"] });
  };

  const filtered = (rows ?? []).filter((r: any) => {
    if (departmentId !== "all") {
      const matchesDept =
        r.department_scope === "all"
        || (r.department_ids ?? []).includes(departmentId)
        || r.department_id === departmentId;
      if (!matchesDept) return false;
    }
    if (roleType !== "all" && r.role_type !== roleType) return false;
    if (hasAccount === "yes" && !r.user_id) return false;
    if (hasAccount === "no" && r.user_id) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary flex items-center gap-2">
            <Briefcase className="h-7 w-7" /> إدارة الموظفين وخدماتهم
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة ملفات الموظفين وحساباتهم، ومتابعة خدماتهم الذاتية والإجازات والرواتب والعُهد والأداء والتطوير.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/imports"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-primary hover:bg-secondary">
            <Upload className="h-4 w-4" /> استيراد جماعي
          </Link>
          {activeTab === "staff" && (
            <button onClick={() => { setShowAdd(true); setError(null); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:opacity-90 shadow-sm">
              <Plus className="h-4 w-4" /> إضافة موظف جديد
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="إخفاء"><X className="h-4 w-4" /></button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="staff"><UsersRound className="h-4 w-4 ml-2" />الموظفون</TabsTrigger>
          <TabsTrigger value="services"><Briefcase className="h-4 w-4 ml-2" />خدمات الموظفين</TabsTrigger>
          <TabsTrigger value="roles"><Briefcase className="h-4 w-4 ml-2" />الأدوار الوظيفية</TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="mt-6 space-y-6">
      <div className="rounded-xl bg-card border border-border p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الرقم الوظيفي..."
              className="w-full rounded-lg border border-border bg-background pr-10 px-3 py-2 text-sm" />
          </div>
          <select value={roleType} onChange={(e) => setRoleType(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">كل الأدوار</option>
            {staffRoleFilterOptions().map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm">
              <option value="all">القسم</option>
              {lookups?.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
            </select>
            <select value={hasAccount} onChange={(e) => setHasAccount(e.target.value as any)}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm">
              <option value="all">الحساب</option>
              <option value="yes">يملك</option>
              <option value="no">بلا</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <select value={status} onChange={(e) => setStatus(e.target.value as any)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
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
          <div className="p-12 text-center text-muted-foreground text-sm">
            لا يوجد موظفون. ابدأ بالضغط على «إضافة موظف جديد».
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-primary">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">الاسم</th>
                  <th className="px-4 py-3 text-right font-bold">الرقم الوظيفي</th>
                  <th className="px-4 py-3 text-right font-bold">الوظيفة</th>
                  <th className="px-4 py-3 text-right font-bold">نطاق الأقسام</th>
                  <th className="px-4 py-3 text-right font-bold">الدور</th>
                  <th className="px-4 py-3 text-right font-bold">حساب الدخول</th>
                  <th className="px-4 py-3 text-right font-bold">الحالة</th>
                  <th className="px-4 py-3 text-right font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => {
                  const hasAcc = !!r.user_id;
                  const isActive = r.status === "active";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-3 font-bold">{r.full_name_ar}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.employee_number || "—"}</td>
                      <td className="px-4 py-3 text-xs">{r.job_title || "—"}</td>
                      <td className="px-4 py-3 text-xs" title={r.department_names_title}>
                        {r.department_label || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="inline-block rounded bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                          {roleTypeLabel(r.role_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" dir="ltr">
                        {r.email ?? <span className="text-muted-foreground">— لا يوجد</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                          isActive ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"
                        }`}>
                          {isActive ? "نشط" : "معطّل"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <button onClick={() => setEditId(r.id)}
                            className="inline-flex items-center gap-1 rounded border border-border hover:bg-secondary px-2 py-1 text-xs">
                            <Pencil className="h-3 w-3" /> تعديل
                          </button>
                          <button onClick={() => setDeleteStaff(r)}
                            className="inline-flex items-center gap-1 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 px-2 py-1 text-xs font-bold">
                            <Trash2 className="h-3 w-3" /> فحص الحذف
                          </button>
                          <button disabled={!!busy || !isActive}
                            title="تعطيل ملف الموظف فقط. هذا لا يمنع تسجيل الدخول تلقائياً؛ استخدم زر تعطيل حساب الدخول لمنع الدخول."
                            onClick={() => run(`deactivate-profile-${r.id}`, async () => {
                              const res = await deactivateProfile({ data: { staffProfileId: r.id } });
                              toast.success("تم تعطيل ملف الموظف");
                              if (res.warning) toast.warning(res.warning);
                            }, refresh)}
                            className="inline-flex items-center gap-1 rounded border border-amber-500/40 text-amber-800 hover:bg-amber-500/10 px-2 py-1 text-xs disabled:opacity-50">
                            {busy === `deactivate-profile-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldOff className="h-3 w-3" />}
                            تعطيل الملف
                          </button>
                          {!hasAcc ? (
                            <button disabled={!!busy}
                              onClick={() => run(`create-${r.id}`, async () => {
                                const res = await create({ data: { kind: "staff", profile_id: r.id } });
                                setSlip({
                                  portal: "staff",
                                  full_name_ar: r.full_name_ar,
                                  identifier: r.employee_number,
                                  email: res.email,
                                  password: res.password ?? "— (حساب Auth موجود مسبقاً)",
                                });
                              }, refresh)}
                              className="inline-flex items-center gap-1 rounded border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 px-2 py-1 text-xs font-bold">
                              {busy === `create-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                              إنشاء حساب
                            </button>
                          ) : (
                            <>
                              <button disabled={!!busy}
                                onClick={() => run(`reset-${r.id}`, async () => {
                                  const res = await reset({ data: { kind: "staff", profile_id: r.id } });
                                  setSlip({
                                    portal: "staff",
                                    full_name_ar: r.full_name_ar,
                                    identifier: r.employee_number,
                                    email: r.email,
                                    password: res.password,
                                  });
                                }, refresh)}
                                className="inline-flex items-center gap-1 rounded border border-border hover:bg-secondary px-2 py-1 text-xs">
                                {busy === `reset-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                                إعادة تعيين
                              </button>
                              <button disabled={!!busy}
                                onClick={() => run(`toggle-${r.id}`, () => toggle({ data: { kind: "staff", profile_id: r.id, active: !isActive } }), refresh)}
                                className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                                  isActive
                                    ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                                    : "border-green-500/30 text-green-700 hover:bg-green-500/10"
                                }`}>
                                {busy === `toggle-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : isActive ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                                {isActive ? "تعطيل الدخول" : "تفعيل الدخول"}
                              </button>
                              <button disabled={!!busy}
                                onClick={() => {
                                  if (!confirm(`فك ربط حساب الدخول لـ «${r.full_name_ar}»؟\n\n${UNLINK_LOGIN_CONFIRM}`)) return;
                                  run(`unlink-${r.id}`, () => removeLogin({ data: { kind: "staff", profile_id: r.id } }), refresh);
                                }}
                                className="inline-flex items-center gap-1 rounded border border-amber-500/40 text-amber-800 hover:bg-amber-500/10 px-2 py-1 text-xs">
                                {busy === `unlink-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
                                فك ربط الدخول
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </TabsContent>

        <TabsContent value="services" className="mt-6">
          {portalFeatures.staffSelfServiceLive && (
            <StaffSelfServiceLiveActions variant="approver" />
          )}
          <EmployeeServicesShowcase />
        </TabsContent>

        <TabsContent value="roles" className="mt-6">
          <ProcessingRolesTab />
        </TabsContent>
      </Tabs>

      {showAdd && lookups && (
        <AddStaffModal lookups={lookups} onClose={() => setShowAdd(false)}
          onCreated={(res) => {
            setShowAdd(false);
            refresh();
            if (res.credentials) {
              setSlip({
                portal: "staff",
                full_name_ar: res.full_name_ar,
                identifier: res.employee_number,
                email: res.credentials.email,
                password: res.credentials.password,
              });
            }
          }} />
      )}

      {editId && (
        <EditStaffModal staffId={editId} lookups={lookups}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); refresh(); }} />
      )}

      {deleteStaff && (
        <StaffDeleteDialog
          staff={deleteStaff}
          open={Boolean(deleteStaff)}
          onOpenChange={(open) => { if (!open) setDeleteStaff(null); }}
          onChanged={refresh}
        />
      )}

      {slip && <CredentialsSlip slip={slip} onClose={() => setSlip(null)} />}
    </div>
  );
}

function AddStaffModal({
  lookups,
  onClose,
  onCreated,
}: {
  lookups: Lookups;
  onClose: () => void;
  onCreated: (res: Awaited<ReturnType<ReturnType<typeof useServerFn<typeof createStaffMember>>>>) => void;
}) {
  const createFn = useServerFn(createStaffMember);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    employee_number: "",
    full_name_ar: "",
    full_name_en: "",
    department_scope: "specific" as StaffDepartmentScope,
    department_ids: [] as string[],
    job_title: "",
    role_type: "registrar_general",
    email: "",
    phone: "",
    status: "active" as "active" | "inactive",
    create_login: true,
  });

  const update = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.department_scope === "specific" && form.department_ids.length === 0) {
      setErr("يجب اختيار قسم واحد على الأقل عند تحديد «أقسام محددة»");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const res = await createFn({ data: {
        ...form,
        full_name_en: form.full_name_en || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
      } as any });
      onCreated(res);
    } catch (e: any) {
      setErr(e?.message ?? "تعذّر إنشاء الموظف");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h3 className="font-display text-lg font-bold text-primary flex items-center gap-2">
            <Plus className="h-5 w-5" /> إضافة موظف جديد
          </h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-secondary rounded"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <Section title="البيانات الأساسية">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الرقم الوظيفي *">
                <input required value={form.employee_number} onChange={(e) => update("employee_number", e.target.value)}
                  dir="ltr" placeholder="S0001" pattern="[A-Za-z0-9_-]+"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
              </Field>
              <Field label="الدور الوظيفي *">
                <select required value={form.role_type} onChange={(e) => update("role_type", e.target.value as any)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {staffRoleFormOptionsForCreate().map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
              <Field label="الاسم بالعربية *">
                <input required minLength={2} value={form.full_name_ar} onChange={(e) => update("full_name_ar", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="الاسم بالإنجليزية">
                <input value={form.full_name_en} onChange={(e) => update("full_name_en", e.target.value)} dir="ltr"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="المسمى الوظيفي *">
                <input required value={form.job_title} onChange={(e) => update("job_title", e.target.value)}
                  placeholder="مثل: أمين سجلات"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <StaffDepartmentScopeFields
                departments={lookups.departments}
                scope={form.department_scope}
                departmentIds={form.department_ids}
                onScopeChange={(scope) => update("department_scope", scope)}
                onDepartmentIdsChange={(ids) => update("department_ids", ids)}
                operationalScopeHint
              />
              <Field label="الإيميل الجامعي">
                <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} dir="ltr"
                  placeholder="staff@staff.usr.edu.ye"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="الهاتف">
                <input value={form.phone} onChange={(e) => update("phone", e.target.value)} dir="ltr"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="الحالة">
                <select value={form.status} onChange={(e) => update("status", e.target.value as any)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="active">نشط</option>
                  <option value="inactive">معطّل</option>
                </select>
              </Field>
            </div>
          </Section>

          <Section title="حساب الدخول">
            <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3 cursor-pointer">
              <input type="checkbox" checked={form.create_login} onChange={(e) => update("create_login", e.target.checked)}
                className="mt-0.5 h-4 w-4" />
              <div className="text-sm">
                <div className="font-bold text-primary">إنشاء حساب دخول</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  يتم تسجيل الدخول باستخدام الإيميل الجامعي فقط (مطلوب عند تفعيل هذا الخيار).
                  تُنشأ كلمة مرور مؤقتة عشوائية — سياسة كلمة المرور للموظفين قابلة للتخصيص لاحقاً.
                </div>
              </div>
            </label>
          </Section>

          {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">{err}</div>}
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2 shrink-0 bg-secondary/30">
          <button type="button" onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold">إلغاء</button>
          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
          </button>
        </div>
      </form>
    </div>
  );
}

function EditStaffModal({
  staffId,
  lookups,
  onClose,
  onSaved,
}: {
  staffId: string;
  lookups: Lookups | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const getFn = useServerFn(getStaffMember);
  const updateFn = useServerFn(updateStaffMember);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: staff, isLoading } = useQuery({
    queryKey: ["admin-staff-detail", staffId],
    queryFn: () => getFn({ data: { id: staffId } }),
  });

  const [form, setForm] = useState<any>(null);
  if (staff && !form) {
    const scope = ((staff as any).department_scope === "all" ? "all" : "specific") as StaffDepartmentScope;
    setForm({
      full_name_ar: (staff as any).full_name_ar ?? "",
      full_name_en: (staff as any).full_name_en ?? "",
      department_scope: scope,
      department_ids: (staff as any).department_ids ?? [],
      job_title: (staff as any).job_title ?? "",
      role_type: (staff as any).role_type ?? "registrar_general",
      email: "",
      phone: "",
      status: (staff as any).status ?? "active",
    });
  }

  const update = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.department_scope === "specific" && form.department_ids.length === 0) {
      setErr("يجب اختيار قسم واحد على الأقل عند تحديد «أقسام محددة»");
      return;
    }
    setBusy(true); setErr(null);
    try {
      await updateFn({ data: { id: staffId, ...form } });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "تعذّر التحديث");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h3 className="font-display text-lg font-bold text-primary flex items-center gap-2">
            <Pencil className="h-5 w-5" /> تعديل بيانات الموظف
          </h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-secondary rounded"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {isLoading || !form ? (
            <div className="p-8 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="rounded-lg bg-secondary/50 px-3 py-2 text-xs">
                <span className="text-muted-foreground">الرقم الوظيفي:</span>{" "}
                <span className="font-mono font-bold">{(staff as any)?.employee_number}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="الاسم بالعربية *">
                  <input required minLength={2} value={form.full_name_ar} onChange={(e) => update("full_name_ar", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="الاسم بالإنجليزية">
                  <input value={form.full_name_en} onChange={(e) => update("full_name_en", e.target.value)} dir="ltr"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="المسمى الوظيفي *">
                  <input required value={form.job_title} onChange={(e) => update("job_title", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="الدور الوظيفي *">
                  <select required value={form.role_type} onChange={(e) => update("role_type", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {staffRoleFormOptionsForEdit(form.role_type).map((r) => (
                      <option key={r.value} value={r.value} disabled={r.isLegacy}>{r.label}</option>
                    ))}
                  </select>
                </Field>
                {lookups && (
                  <StaffDepartmentScopeFields
                    departments={lookups.departments}
                    scope={form.department_scope}
                    departmentIds={form.department_ids}
                    onScopeChange={(scope) => update("department_scope", scope)}
                    onDepartmentIdsChange={(ids) => update("department_ids", ids)}
                    operationalScopeHint
                  />
                )}
                <Field label="الحالة">
                  <select value={form.status} onChange={(e) => update("status", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="active">نشط</option>
                    <option value="inactive">معطّل</option>
                  </select>
                </Field>
              </div>
              {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">{err}</div>}
            </>
          )}
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2 shrink-0 bg-secondary/30">
          <button type="button" onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold">إلغاء</button>
          <button type="submit" disabled={busy || !form}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} حفظ التغييرات
          </button>
        </div>
      </form>
    </div>
  );
}
