import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users, KeyRound, Link2, Plus, Search, Loader2, X, FileDown, ArrowRight, CheckCircle2,
  Mail, Upload, AlertTriangle,
} from "lucide-react";
import {
  listFacultyAccounts, facultyAccountStats,
  createFacultyAccountManual, linkFacultyAccountByEmail, resetFacultyPasswordManual,
  auditFacultyAccountExport,
} from "@/lib/faculty-accounts.functions";
import {
  previewFacultyAccountEmailUpdates,
  executeFacultyAccountEmailUpdates,
} from "@/lib/faculty-accounts-email-update.functions";
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
  const [showEmailUpdate, setShowEmailUpdate] = useState(false);

  const listFn = useServerFn(listFacultyAccounts);
  const statsFn = useServerFn(facultyAccountStats);
  const lookupsFn = useServerFn(getPeopleLookups);

  // Live search after 3+ chars.
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const effectiveSearch = debouncedSearch.length >= 3 ? debouncedSearch : "";
  const { data: rows, isLoading } = useQuery({
    queryKey: ["faculty-accounts", effectiveSearch, hasAccount, departmentId],
    queryFn: () => listFn({ data: { search: effectiveSearch || undefined, status: "active", hasAccount, departmentId } }),
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

  async function downloadXlsx(rowsToWrite: Record<string, any>[], filename: string, sheetName: string) {
    const { loadXLSX } = await import("@/lib/xlsx-loader");
    const XLSX = await loadXLSX();
    const ws = XLSX.utils.json_to_sheet(rowsToWrite);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const exportWithoutAccounts = async () => {
    setError(null);
    try {
      const all = await listFn({ data: { status: "active", hasAccount: "no" } });
      const data = all.map((r) => ({
        employee_number: r.employee_number,
        full_name_ar: r.full_name_ar,
        department_name: r.department_name ?? "",
        academic_rank: r.academic_rank ?? "",
        email: "",
        initial_password: "",
      }));
      await downloadXlsx(data, `faculty_without_accounts_${new Date().toISOString().slice(0,10)}.xlsx`, "Without Accounts");
      try { await auditExportFn({ data: { kind: "without_accounts", count: data.length } }); } catch {/* ignore */}
      setSuccess(`تم تصدير ${data.length} عضواً بدون حسابات`);
    } catch (e: any) { setError(e.message ?? "فشل التصدير"); }
  };

  const exportAccountsStatus = async () => {
    setError(null);
    try {
      const all = await listFn({ data: { status: "active", hasAccount: "all" } });
      const data = all.map((r) => ({
        employee_number: r.employee_number,
        full_name_ar: r.full_name_ar,
        department_name: r.department_name ?? "",
        academic_rank: r.academic_rank ?? "",
        email: r.email ?? "",
        has_account: r.user_id ? "نعم" : "لا",
        account_status: STATE_LABEL[r.account_state].text,
        last_sign_in_at: r.last_sign_in_at ?? "",
      }));
      await downloadXlsx(data, `faculty_accounts_status_${new Date().toISOString().slice(0,10)}.xlsx`, "Accounts Status");
      try { await auditExportFn({ data: { kind: "status", count: data.length } }); } catch {/* ignore */}
      setSuccess(`تم تصدير حالة ${data.length} حساباً`);
    } catch (e: any) { setError(e.message ?? "فشل التصدير"); }
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
          <button onClick={exportWithoutAccounts} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-primary hover:bg-secondary">
            <FileDown className="h-4 w-4" /> تصدير بدون حسابات
          </button>
          <button onClick={exportAccountsStatus} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-primary hover:bg-secondary">
            <FileDown className="h-4 w-4" /> تصدير حالة الحسابات
          </button>
          <button onClick={() => setShowEmailUpdate((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100">
            <Mail className="h-4 w-4" /> تحديث البريد للحسابات المرتبطة
          </button>
          <Link to="/admin/imports" className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-bold hover:opacity-90">
            <FileDown className="h-4 w-4" /> استيراد من Excel
          </Link>
        </div>
      </div>

      {showEmailUpdate && <EmailUpdatePanel onDone={refresh} />}

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

// ============================================================
// FACULTY_ACCOUNTS_EXISTING_EMAIL_UPDATE_IMPORTER_REMEDIATION_01
// Explicit "UPDATE_EXISTING_FACULTY_ACCOUNT_EMAILS" panel.
// Never auto-runs; requires file upload → Dry Run → explicit confirmation → Execute.
// ============================================================
type PreviewResp = Awaited<ReturnType<typeof previewFacultyAccountEmailUpdates>>;
type PreviewRow = PreviewResp["rows"][number];

const OUTCOME_LABEL: Record<PreviewRow["outcome"], { text: string; cls: string; ready: boolean }> = {
  READY_AUTH_AND_FACULTY_EMAIL_UPDATE: { text: "جاهز: تحديث Auth و faculty", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", ready: true },
  READY_FACULTY_EMAIL_BACKFILL_ONLY: { text: "جاهز: ردم faculty.email فقط", cls: "bg-sky-50 text-sky-700 border-sky-200", ready: true },
  ALREADY_MATCHED: { text: "مطابق — لا تغيير", cls: "bg-slate-100 text-slate-700 border-slate-200", ready: false },
  EMAIL_CONFLICT: { text: "تعارض بريد", cls: "bg-rose-50 text-rose-700 border-rose-200", ready: false },
  FACULTY_NOT_FOUND: { text: "الرقم الوظيفي غير موجود", cls: "bg-rose-50 text-rose-700 border-rose-200", ready: false },
  FACULTY_DUPLICATE: { text: "رقم وظيفي مكرر", cls: "bg-rose-50 text-rose-700 border-rose-200", ready: false },
  AUTH_USER_NOT_FOUND: { text: "حساب Auth مفقود", cls: "bg-rose-50 text-rose-700 border-rose-200", ready: false },
  ACCOUNT_LINK_AMBIGUOUS: { text: "الملف غير مرتبط", cls: "bg-amber-50 text-amber-800 border-amber-200", ready: false },
  INVALID_EMAIL: { text: "بريد غير صالح", cls: "bg-rose-50 text-rose-700 border-rose-200", ready: false },
  FAILED: { text: "فشل", cls: "bg-rose-50 text-rose-700 border-rose-200", ready: false },
};

function EmailUpdatePanel({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [busy, setBusy] = useState<"idle" | "preview" | "execute">("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof executeFacultyAccountEmailUpdates>> | null>(null);

  const previewFn = useServerFn(previewFacultyAccountEmailUpdates);
  const executeFn = useServerFn(executeFacultyAccountEmailUpdates);

  const readyCount = useMemo(() => {
    if (!preview) return 0;
    return preview.totals.ready_auth_and_faculty + preview.totals.ready_faculty_backfill;
  }, [preview]);
  const hasBlockingConflicts = (preview?.totals.email_conflict ?? 0) > 0;

  const parseFile = async (f: File): Promise<Array<{ row_number: number; employee_number: string; email: string }>> => {
    const { loadXLSX } = await import("@/lib/xlsx-loader");
    const XLSX = await loadXLSX();
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
    return json.map((r, i) => ({
      row_number: i + 2,
      employee_number: String(r.employee_number ?? "").trim(),
      email: String(r.email ?? "").trim(),
    }));
  };

  const runPreview = async () => {
    if (!file) return;
    setBusy("preview"); setError(null); setResult(null);
    try {
      const rows = await parseFile(file);
      const resp = await previewFn({ data: { rows, file_name: file.name } });
      setPreview(resp); setConfirmChecked(false);
    } catch (e: any) { setError(e?.message ?? "فشل Dry Run"); }
    finally { setBusy("idle"); }
  };

  const runExecute = async () => {
    if (!file || !preview) return;
    setBusy("execute"); setError(null);
    try {
      const rows = await parseFile(file);
      const resp = await executeFn({ data: { rows, file_name: file.name, confirm: true } });
      setResult(resp); onDone();
    } catch (e: any) { setError(e?.message ?? "فشل التنفيذ"); }
    finally { setBusy("idle"); }
  };

  return (
    <section className="rounded-xl border-2 border-amber-300 bg-amber-50/40 p-5 shadow-card space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-900 space-y-1">
          <div className="font-extrabold">وضع صريح: تحديث بريد تسجيل الدخول للحسابات المرتبطة مسبقاً</div>
          <div className="text-xs">
            هذا الوضع يقوم فقط بتحديث البريد على مستوى Auth و <code>faculty.email</code>.
            لا يغيّر كلمات المرور، ولا الأدوار، ولا التكليفات، ولا <code>must_change_password</code>،
            ولا الرقم الوظيفي، ولا اسم العضو، ولا ينشئ مستخدمين جدداً.
          </div>
          <div className="text-xs">المطابقة تتم حصراً بواسطة <code>employee_number</code>.</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground cursor-pointer hover:opacity-90">
          <Upload className="h-4 w-4" /> رفع ملف Excel
          <input type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(null); setResult(null); setError(null); } }} />
        </label>
        {file && <span className="text-xs text-muted-foreground">الملف: <span className="font-mono">{file.name}</span></span>}
        {file && !preview && (
          <button onClick={runPreview} disabled={busy !== "idle"}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            تشغيل Dry Run
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {preview && !result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <StatBox label="إجمالي" value={preview.totals.total} tone="neutral" />
            <StatBox label="جاهز Auth+faculty" value={preview.totals.ready_auth_and_faculty} tone="ok" />
            <StatBox label="ردم faculty فقط" value={preview.totals.ready_faculty_backfill} tone="ok" />
            <StatBox label="مطابق" value={preview.totals.already_matched} tone="neutral" />
            <StatBox label="تعارض" value={preview.totals.email_conflict} tone="bad" />
            <StatBox label="غير موجود" value={preview.totals.faculty_not_found} tone="bad" />
            <StatBox label="مكرر" value={preview.totals.faculty_duplicate} tone="bad" />
            <StatBox label="Auth مفقود" value={preview.totals.auth_user_not_found} tone="bad" />
            <StatBox label="بريد غير صالح" value={preview.totals.invalid_email} tone="bad" />
            <StatBox label="فشل" value={preview.totals.failed} tone="bad" />
          </div>

          <div className="rounded-lg border border-border bg-background overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40">
                <tr>
                  <th className="px-2 py-1 text-right">الصف</th>
                  <th className="px-2 py-1 text-right">الرقم الوظيفي</th>
                  <th className="px-2 py-1 text-right">الاسم</th>
                  <th className="px-2 py-1 text-right">بريد faculty الحالي</th>
                  <th className="px-2 py-1 text-right">بريد Auth الحالي</th>
                  <th className="px-2 py-1 text-right">البريد الجديد</th>
                  <th className="px-2 py-1 text-right">النتيجة</th>
                  <th className="px-2 py-1 text-right">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const meta = OUTCOME_LABEL[r.outcome];
                  return (
                    <tr key={r.row_number} className="border-t border-border/60">
                      <td className="px-2 py-1 font-mono">{r.row_number}</td>
                      <td className="px-2 py-1 font-mono">{r.employee_number}</td>
                      <td className="px-2 py-1">{r.full_name_ar ?? "—"}</td>
                      <td className="px-2 py-1 font-mono">{r.current_faculty_email_masked}</td>
                      <td className="px-2 py-1 font-mono">{r.current_auth_email_masked}</td>
                      <td className="px-2 py-1 font-mono">{r.new_email}</td>
                      <td className="px-2 py-1"><span className={`inline-block rounded-full border px-2 py-0.5 font-bold ${meta.cls}`}>{meta.text}</span></td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {r.message ?? ""}
                        {r.warnings.length > 0 && (
                          <div className="text-amber-700 text-[10px] mt-0.5">{r.warnings.join(" • ")}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {readyCount > 0 && !hasBlockingConflicts && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
                <span>
                  أؤكد أنه سيتم تغيير بريد تسجيل الدخول لعدد <b>{readyCount}</b> حساب/حسابات،
                  مع المحافظة على الحسابات والأدوار والتكليفات وكلمات المرور الحالية.
                </span>
              </label>
              <button
                onClick={runExecute}
                disabled={!confirmChecked || busy !== "idle"}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy === "execute" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                تنفيذ التحديث
              </button>
            </div>
          )}
          {hasBlockingConflicts && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              يوجد تعارضات في البريد — يجب معالجتها قبل التنفيذ.
            </div>
          )}
        </>
      )}

      {result && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <StatBox label="إجمالي" value={result.totals.total} tone="neutral" />
            <StatBox label="محدث Auth+faculty" value={result.totals.updated_auth_and_faculty} tone="ok" />
            <StatBox label="ردم faculty" value={result.totals.backfilled_faculty_only} tone="ok" />
            <StatBox label="بدون تغيير" value={result.totals.unchanged} tone="neutral" />
            <StatBox label="فشل" value={result.totals.failed} tone="bad" />
          </div>
          <div className="text-xs text-muted-foreground">
            الحالة: <span className="font-bold">{result.status}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: "ok" | "bad" | "neutral" }) {
  const cls = tone === "ok" ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : tone === "bad" ? "bg-rose-50 text-rose-800 border-rose-200"
    : "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${cls}`}>
      <div className="text-[10px]">{label}</div>
      <div className="text-lg font-extrabold leading-tight">{value}</div>
    </div>
  );
}
