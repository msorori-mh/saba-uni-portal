import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users, KeyRound, Link2, Plus, Search, Loader2, X, FileDown, ArrowRight, CheckCircle2,
} from "lucide-react";
import {
  listFacultyAccounts, facultyAccountStats,
  createFacultyAccountManual, linkFacultyAccountByEmail, resetFacultyPasswordManual,
  auditFacultyAccountExport,
} from "@/lib/faculty-accounts.functions";
import { getPeopleLookups } from "@/lib/admin-people.functions";

export const Route = createFileRoute("/admin/faculty-accounts")({
  head: () => ({ meta: [{ title: "إدارة حسابات أعضاء هيئة التدريس" }] }),
  component: FacultyAccountsPage,
});

type Row = Awaited<ReturnType<typeof listFacultyAccounts>>[number];

const STATE_LABEL: Record<Row["account_state"], { text: string; cls: string }> = {
  none: { text: "لا يوجد حساب", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  linked: { text: "حساب مرتبط", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  disabled: { text: "حساب معطل", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  review: { text: "يحتاج مراجعة", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

function FacultyAccountsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [hasAccount, setHasAccount] = useState<"all" | "yes" | "no">("all");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createFor, setCreateFor] = useState<Row | null>(null);
  const [linkFor, setLinkFor] = useState<Row | null>(null);
  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [revealPassword, setRevealPassword] = useState<{ employee_number: string; password: string } | null>(null);

  const listFn = useServerFn(listFacultyAccounts);
  const statsFn = useServerFn(facultyAccountStats);
  const lookupsFn = useServerFn(getPeopleLookups);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["faculty-accounts", search, hasAccount, departmentId],
    queryFn: () => listFn({ data: { search: search || undefined, status: "active", hasAccount, departmentId } }),
  });
  const { data: stats } = useQuery({ queryKey: ["faculty-account-stats"], queryFn: () => statsFn() });
  const { data: lookups } = useQuery({ queryKey: ["admin-people-lookups"], queryFn: () => lookupsFn() });

  const auditExportFn = useServerFn(auditFacultyAccountExport);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["faculty-accounts"] });
    qc.invalidateQueries({ queryKey: ["faculty-account-stats"] });
  };

  const exportTemplate = async () => {
    setError(null);
    try {
      const { loadXLSX } = await import("@/lib/xlsx-loader");
      const XLSX = await loadXLSX();
      const data = (rows ?? []).map((r) => ({
        employee_number: r.employee_number,
        full_name_ar: r.full_name_ar,
        department_name: r.department_name ?? "",
        academic_rank: r.academic_rank ?? "",
        email: "",
        initial_password: "",
        force_password_change: "true",
        role: "faculty_member",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Faculty Accounts");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "template_faculty_accounts.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message ?? "فشل التصدير");
    }
  };

  const kpis = [
    { label: "إجمالي أعضاء هيئة التدريس", value: stats?.total ?? "—" },
    { label: "لديهم حساب", value: stats?.withAccount ?? "—" },
    { label: "بدون حساب", value: stats?.withoutAccount ?? "—" },
    { label: "آخر دخول خلال 30 يوم", value: stats?.active30 ?? "—" },
    { label: "لم يسجلوا دخول أبداً", value: stats?.neverSignedIn ?? "—" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary flex items-center gap-2">
            <KeyRound className="h-7 w-7" /> إدارة حسابات أعضاء هيئة التدريس
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إنشاء وربط حسابات الدخول لأعضاء هيئة التدريس باستخدام البريد الإلكتروني الرسمي.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/admin/faculty-management" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-primary hover:bg-secondary">
            <Users className="h-4 w-4" /> إدارة الأعضاء
          </Link>
          <button onClick={exportTemplate} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-primary hover:bg-secondary">
            <FileDown className="h-4 w-4" /> تصدير قالب الحسابات
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-2xl font-extrabold text-primary">{k.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="إخفاء"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-3 text-sm flex items-center justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {success}</span>
          <button onClick={() => setSuccess(null)} aria-label="إخفاء"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl bg-card border border-border p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث برقم الوظيفي أو الاسم..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm"
            />
          </div>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="all">جميع الأقسام</option>
            {(lookups?.departments ?? []).map((d: any) => (
              <option key={d.id} value={d.id}>{d.name_ar}</option>
            ))}
          </select>
          <select value={hasAccount} onChange={(e) => setHasAccount(e.target.value as any)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="all">كل الحالات</option>
            <option value="yes">لديه حساب</option>
            <option value="no">بدون حساب</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-card border border-border overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs font-bold text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-right">الرقم الوظيفي</th>
                <th className="px-3 py-2 text-right">الاسم</th>
                <th className="px-3 py-2 text-right">القسم</th>
                <th className="px-3 py-2 text-right">الرتبة</th>
                <th className="px-3 py-2 text-right">البريد</th>
                <th className="px-3 py-2 text-center">الحساب</th>
                <th className="px-3 py-2 text-right">آخر دخول</th>
                <th className="px-3 py-2 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="py-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>
              )}
              {!isLoading && (rows ?? []).length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">لا توجد نتائج</td></tr>
              )}
              {!isLoading && (rows ?? []).map((r) => {
                const st = STATE_LABEL[r.account_state];
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-3 py-2 font-mono text-xs">{r.employee_number}</td>
                    <td className="px-3 py-2 font-bold">{r.full_name_ar}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.department_name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.academic_rank ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.email ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.text}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.last_sign_in_at ? new Date(r.last_sign_in_at).toLocaleDateString("ar-EG") : "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        {!r.user_id && (
                          <>
                            <button onClick={() => { setCreateFor(r); setError(null); }} className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs font-bold hover:opacity-90">
                              <Plus className="h-3 w-3" /> إنشاء
                            </button>
                            <button onClick={() => { setLinkFor(r); setError(null); }} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-bold text-primary hover:bg-secondary">
                              <Link2 className="h-3 w-3" /> ربط
                            </button>
                          </>
                        )}
                        {r.user_id && (
                          <button onClick={() => { setResetFor(r); setError(null); }} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-bold text-primary hover:bg-secondary">
                            <KeyRound className="h-3 w-3" /> إعادة تعيين
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {createFor && (
        <CreateAccountDialog
          row={createFor}
          onClose={() => setCreateFor(null)}
          onSuccess={(msg) => { setSuccess(msg); setCreateFor(null); refresh(); }}
          onError={setError}
        />
      )}
      {linkFor && (
        <LinkAccountDialog
          row={linkFor}
          onClose={() => setLinkFor(null)}
          onSuccess={(msg) => { setSuccess(msg); setLinkFor(null); refresh(); }}
          onError={setError}
        />
      )}
      {resetFor && (
        <ResetPasswordDialog
          row={resetFor}
          onClose={() => setResetFor(null)}
          onSuccess={(pwd) => { setRevealPassword({ employee_number: resetFor.employee_number, password: pwd }); setResetFor(null); refresh(); }}
          onError={setError}
        />
      )}
      {revealPassword && (
        <PasswordRevealDialog data={revealPassword} onClose={() => setRevealPassword(null)} />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-primary text-primary-foreground px-5 py-3 flex items-center justify-between">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function CreateAccountDialog({ row, onClose, onSuccess, onError }: { row: Row; onClose: () => void; onSuccess: (m: string) => void; onError: (m: string) => void }) {
  const fn = useServerFn(createFacultyAccountManual);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [force, setForce] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return onError("كلمة المرور يجب 8 أحرف على الأقل");
    if (password !== confirm) return onError("كلمتا المرور غير متطابقتين");
    setBusy(true);
    try {
      const r = await fn({ data: { profile_id: row.id, email, password, force_password_change: force } });
      onSuccess(r.linked_existing ? `تم ربط الحساب الموجود ${r.email}` : `تم إنشاء حساب ${r.email}`);
    } catch (err: any) {
      onError(err.message ?? "فشل");
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`إنشاء حساب لـ ${row.full_name_ar}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="البريد الإلكتروني *">
          <input type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label="كلمة المرور الأولية *">
          <input type="text" required dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono" />
        </Field>
        <Field label="تأكيد كلمة المرور *">
          <input type="text" required dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          إجبار تغيير كلمة المرور عند أول دخول
        </label>
        <div className="text-xs text-muted-foreground">الدور: <span className="font-bold">faculty_member</span></div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm font-bold">إلغاء</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-bold disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            حفظ
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LinkAccountDialog({ row, onClose, onSuccess, onError }: { row: Row; onClose: () => void; onSuccess: (m: string) => void; onError: (m: string) => void }) {
  const fn = useServerFn(linkFacultyAccountByEmail);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fn({ data: { profile_id: row.id, email } });
      onSuccess(`تم ربط ${r.email}`);
    } catch (err: any) {
      onError(err.message ?? "فشل");
    } finally { setBusy(false); }
  };
  return (
    <Modal title={`ربط حساب لـ ${row.full_name_ar}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-muted-foreground">سيتم البحث عن حساب Auth موجود بنفس البريد وربطه بهذا الملف.</p>
        <Field label="البريد الإلكتروني الموجود *">
          <input type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm font-bold">إلغاء</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-bold disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            ربط
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({ row, onClose, onSuccess, onError }: { row: Row; onClose: () => void; onSuccess: (pwd: string) => void; onError: (m: string) => void }) {
  const fn = useServerFn(resetFacultyPasswordManual);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "manual" && password.length < 8) return onError("كلمة المرور يجب 8 أحرف على الأقل");
    setBusy(true);
    try {
      const r = await fn({ data: { profile_id: row.id, password: mode === "manual" ? password : undefined } });
      onSuccess(r.password);
    } catch (err: any) {
      onError(err.message ?? "فشل");
    } finally { setBusy(false); }
  };
  return (
    <Modal title={`إعادة تعيين كلمة المرور — ${row.full_name_ar}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={() => setMode("auto")} className={`px-3 py-1.5 rounded-md font-bold ${mode === "auto" ? "bg-primary text-primary-foreground" : "border border-border"}`}>توليد تلقائي</button>
          <button type="button" onClick={() => setMode("manual")} className={`px-3 py-1.5 rounded-md font-bold ${mode === "manual" ? "bg-primary text-primary-foreground" : "border border-border"}`}>تحديد يدوياً</button>
        </div>
        {mode === "manual" && (
          <Field label="كلمة المرور الجديدة *">
            <input type="text" required dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono" />
          </Field>
        )}
        <p className="text-xs text-muted-foreground">سيتم عرض كلمة المرور مرة واحدة فقط، ولن يتم تخزينها.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm font-bold">إلغاء</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-bold disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            إعادة تعيين
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordRevealDialog({ data, onClose }: { data: { employee_number: string; password: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.password); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <Modal title="كلمة المرور الجديدة" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">احفظ كلمة المرور التالية الآن — لن تُعرض مرة أخرى.</p>
        <div className="rounded-md border-2 border-primary/30 bg-secondary/30 p-3 font-mono text-lg text-center font-bold" dir="ltr">{data.password}</div>
        <div className="text-xs text-muted-foreground">للعضو: <span className="font-mono font-bold">{data.employee_number}</span></div>
        <div className="flex justify-end gap-2">
          <button onClick={copy} className="rounded-md border border-border bg-card px-3 py-2 text-sm font-bold text-primary hover:bg-secondary">
            {copied ? "تم النسخ" : "نسخ"}
          </button>
          <button onClick={onClose} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-bold">إغلاق</button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}
