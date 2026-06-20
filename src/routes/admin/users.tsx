import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listUsers, createAccount, resetPassword, setActive, addRole, removeRole,
  adminAccountCounts, createAdminAccount, removeLoginAccount,
} from "@/lib/admin-users.functions";
import {
  Loader2, Search, KeyRound, UserCheck, UserX, ShieldPlus, X, Plus, ShieldMinus,
  ShieldAlert, ShieldCheck, Unlink,
} from "lucide-react";

const UNLINK_LOGIN_CONFIRM =
  "سيتم فك ربط حساب الدخول فقط. لن يُحذف الملف الأكاديمي أو المالي أو الإداري. يمكن إنشاء حساب دخول جديد لاحقاً.\n\nهل تريد المتابعة؟";

export const Route = createFileRoute("/admin/users")({
  component: UsersPage,
});

type Kind = "student" | "faculty" | "staff";

const KIND_LABELS: Record<Kind, string> = {
  student: "الطلاب",
  faculty: "أعضاء هيئة التدريس",
  staff: "الموظفون",
};

const AVAILABLE_ROLES = [
  "admin", "system_admin", "dean", "registrar", "student_affairs",
  "finance_officer", "department_head", "faculty_member", "student", "graduate",
];

function UsersPage() {
  const [kind, setKind] = useState<Kind>("student");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [rolesFor, setRolesFor] = useState<{ user_id: string; name: string; roles: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  const [passwordReveal, setPasswordReveal] = useState<{ name: string; password: string } | null>(null);

  const list = useServerFn(listUsers);
  const create = useServerFn(createAccount);
  const reset = useServerFn(resetPassword);
  const toggle = useServerFn(setActive);
  const addR = useServerFn(addRole);
  const rmR = useServerFn(removeRole);
  const adminCounts = useServerFn(adminAccountCounts);
  const createAdmin = useServerFn(createAdminAccount);
  const removeLogin = useServerFn(removeLoginAccount);

  const qc = useQueryClient();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-users", kind, search, status],
    queryFn: () => list({ data: { kind, search: search || undefined, status } }),
  });
  const { data: counts } = useQuery({
    queryKey: ["admin-account-counts"],
    queryFn: () => adminCounts(),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard-counts"] });
    qc.invalidateQueries({ queryKey: ["active-user-counts"] });
    qc.invalidateQueries({ queryKey: ["admin-account-counts"] });
    qc.invalidateQueries({ queryKey: ["hardening-status"] });
  };

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setError(null);
    try { await fn(); refresh(); }
    catch (e: any) { setError(e?.message ?? "خطأ"); }
    finally { setBusy(null); }
  };

  const adminCount = counts?.admin ?? 0;
  const systemAdminCount = counts?.system_admin ?? 0;
  const adminHealthy = adminCount >= 2 && systemAdminCount >= 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-primary">المستخدمون والصلاحيات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إدارة حسابات الطلاب وأعضاء هيئة التدريس والموظفين وصلاحياتهم.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Admin Accounts banner */}
      <div className={`rounded-xl border p-5 shadow-card ${adminHealthy ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-start gap-3">
            {adminHealthy ? <ShieldCheck className="h-5 w-5 text-emerald-700 mt-0.5" /> : <ShieldAlert className="h-5 w-5 text-amber-700 mt-0.5" />}
            <div>
              <div className={`font-bold ${adminHealthy ? "text-emerald-800" : "text-amber-800"}`}>الحسابات الإدارية</div>
              <div className="text-xs mt-1 text-muted-foreground">
                Admin: <span className="font-bold">{adminCount}</span> · System Admin: <span className="font-bold">{systemAdminCount}</span>
                {!adminHealthy && <span className="block mt-1 text-amber-800">يُنصح بوجود ≥ 2 Admin و ≥ 1 System Admin قبل الإطلاق.</span>}
              </div>
            </div>
          </div>
          <button
            onClick={() => { setShowAdminForm(true); setAdminMsg(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold hover:opacity-90"
          >
            <ShieldPlus className="h-3.5 w-3.5" /> إنشاء حساب Admin / System Admin
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)}
            className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition ${
              kind === k
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-primary"
            }`}>
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-card border border-border p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الرقم..."
              className="w-full rounded-lg border border-border bg-background pr-10 px-3 py-2 text-sm" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">معطّل</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">لا توجد نتائج.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-primary">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">الاسم</th>
                  <th className="px-4 py-3 text-right font-bold">الرقم</th>
                  <th className="px-4 py-3 text-right font-bold">الحساب</th>
                  <th className="px-4 py-3 text-right font-bold">الأدوار</th>
                  <th className="px-4 py-3 text-right font-bold">الحالة</th>
                  <th className="px-4 py-3 text-right font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const hasAccount = !!r.user_id;
                  const isActive = r.status === "active";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-3 font-bold">{r.full_name_ar}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.identifier}</td>
                      <td className="px-4 py-3 text-xs font-mono" dir="ltr">{r.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(r.roles ?? []).map((role: string) => (
                            <span key={role} className="inline-block rounded bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                              {role}
                            </span>
                          ))}
                          {hasAccount && (r.roles ?? []).length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
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
                          {!hasAccount && (
                            <button disabled={!!busy}
                              onClick={() => run(`create-${r.id}`, async () => {
                                const res = await create({ data: { kind, profile_id: r.id } });
                                if (res.password) {
                                  setPasswordReveal({ name: r.full_name_ar, password: res.password });
                                }
                              })}
                              className="inline-flex items-center gap-1 rounded border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 px-2 py-1 text-xs font-bold">
                              {busy === `create-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                              إنشاء حساب
                            </button>
                          )}
                          {hasAccount && (
                            <>
                              <button disabled={!!busy}
                                onClick={() => run(`reset-${r.id}`, async () => {
                                  const res = await reset({ data: { kind, profile_id: r.id } });
                                  setPasswordReveal({ name: r.full_name_ar, password: res.password });
                                })}
                                className="inline-flex items-center gap-1 rounded border border-border hover:bg-secondary px-2 py-1 text-xs">
                                {busy === `reset-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                                إعادة تعيين
                              </button>
                              <button disabled={!!busy}
                                onClick={() => run(`toggle-${r.id}`, () => toggle({ data: { kind, profile_id: r.id, active: !isActive } }))}
                                className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                                  isActive
                                    ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                                    : "border-green-500/30 text-green-700 hover:bg-green-500/10"
                                }`}>
                                {busy === `toggle-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : isActive ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                                {isActive ? "تعطيل" : "تفعيل"}
                              </button>
                              <button disabled={!!busy}
                                onClick={() => setRolesFor({ user_id: r.user_id, name: r.full_name_ar, roles: r.roles ?? [] })}
                                className="inline-flex items-center gap-1 rounded border border-border hover:bg-secondary px-2 py-1 text-xs">
                                <ShieldPlus className="h-3 w-3" />
                                الأدوار
                              </button>
                              <button disabled={!!busy}
                                onClick={() => {
                                  if (!confirm(`فك ربط حساب الدخول لـ «${r.full_name_ar}»؟\n\n${UNLINK_LOGIN_CONFIRM}`)) return;
                                  run(`unlink-${r.id}`, () => removeLogin({ data: { kind, profile_id: r.id } }));
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

      {passwordReveal && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setPasswordReveal(null)}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-primary">كلمة المرور الجديدة</h3>
            <p className="text-sm text-muted-foreground">للمستخدم: {passwordReveal.name}</p>
            <p className="font-mono text-sm bg-muted rounded-md px-3 py-2 break-all" dir="ltr">{passwordReveal.password}</p>
            <p className="text-xs text-destructive">احفظها الآن — لن تُعرض مرة أخرى.</p>
            <div className="flex justify-end">
              <button onClick={() => setPasswordReveal(null)} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-bold">
                تم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Roles modal */}
      {rolesFor && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setRolesFor(null)}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-display text-lg font-bold text-primary">إدارة أدوار: {rolesFor.name}</h3>
              <button onClick={() => setRolesFor(null)} className="p-1 hover:bg-secondary rounded"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">حدد الأدوار الممنوحة لهذا المستخدم.</p>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_ROLES.map((role) => {
                  const has = rolesFor.roles.includes(role);
                  return (
                    <button key={role} disabled={!!busy}
                      onClick={() => run(`role-${role}`, async () => {
                        if (has) await rmR({ data: { user_id: rolesFor.user_id, role } });
                        else await addR({ data: { user_id: rolesFor.user_id, role } });
                        setRolesFor({
                          ...rolesFor,
                          roles: has ? rolesFor.roles.filter((r) => r !== role) : [...rolesFor.roles, role],
                        });
                      })}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${
                        has
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      }`}>
                      <span>{role}</span>
                      {busy === `role-${role}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : has ? <ShieldMinus className="h-3.5 w-3.5" /> : <ShieldPlus className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Admin/SystemAdmin modal */}
      {showAdminForm && (
        <CreateAdminModal
          onClose={() => setShowAdminForm(false)}
          onSubmit={async (payload) => {
            setAdminMsg(null);
            try {
              const r = await createAdmin({ data: payload });
              setAdminMsg(`تم إنشاء الحساب: ${r.email}`);
              refresh();
              setShowAdminForm(false);
            } catch (e: any) {
              throw new Error(e?.message ?? "تعذّر الإنشاء");
            }
          }}
        />
      )}
      {adminMsg && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm rounded-lg bg-emerald-600 text-white px-4 py-3 text-sm font-bold shadow-lg z-50">
          {adminMsg}
        </div>
      )}
    </div>
  );
}

function CreateAdminModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: { email: string; password: string; full_name_ar: string; role: "admin" | "system_admin" }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "system_admin">("admin");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await onSubmit({ email, password, full_name_ar: name, role }); }
    catch (e: any) { setErr(e?.message ?? "خطأ"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl w-full max-w-md"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-display text-lg font-bold text-primary">إنشاء حساب إداري</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-secondary rounded"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="الاسم الكامل (عربي)">
            <input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="البريد الإلكتروني">
            <input required type="email" maxLength={160} value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
          </Field>
          <Field label="كلمة المرور (8+ محارف)">
            <input required type="password" minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
          </Field>
          <Field label="نوع الحساب">
            <select value={role} onChange={(e) => setRole(e.target.value as any)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="admin">Admin</option>
              <option value="system_admin">System Admin</option>
            </select>
          </Field>
          {err && <div className="text-xs text-destructive">{err}</div>}
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-bold">إلغاء</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} إنشاء
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-primary">{label}</span>
      {children}
    </label>
  );
}
