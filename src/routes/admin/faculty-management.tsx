import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, Search, Loader2, X, Pencil, KeyRound, UserCheck, UserX,
  Users, Upload, FileSpreadsheet, FileText,
} from "lucide-react";
import { listUsers, createAccount, resetPassword, setActive } from "@/lib/admin-users.functions";
import {
  getPeopleLookups, createFacultyMember, updateFacultyMember, getFacultyMember,
} from "@/lib/admin-people.functions";
import { CredentialsSlip, Section, Field, useBusyError, type CredentialsSlipData } from "@/components/admin/people/shared";
import { buildFilename, exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/faculty-management")({
  head: () => ({ meta: [{ title: "إدارة أعضاء هيئة التدريس — لوحة الإدارة" }] }),
  component: FacultyManagementPage,
});

type Lookups = Awaited<ReturnType<typeof getPeopleLookups>>;

function FacultyManagementPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [hasAccount, setHasAccount] = useState<"all" | "yes" | "no">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [slip, setSlip] = useState<CredentialsSlipData | null>(null);

  const list = useServerFn(listUsers);
  const create = useServerFn(createAccount);
  const reset = useServerFn(resetPassword);
  const toggle = useServerFn(setActive);
  const lookupsFn = useServerFn(getPeopleLookups);

  const qc = useQueryClient();
  const { busy, error, setError, run } = useBusyError();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-faculty-management", search, status],
    queryFn: () => list({ data: { kind: "faculty", search: search || undefined, status } }),
  });
  const { data: lookups } = useQuery({
    queryKey: ["admin-people-lookups"],
    queryFn: () => lookupsFn(),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-faculty-management"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["people-stats"] });
  };

  const filtered = (rows ?? []).filter((r: any) => {
    if (departmentId !== "all" && r.department_id !== departmentId) return false;
    if (hasAccount === "yes" && !r.user_id) return false;
    if (hasAccount === "no" && r.user_id) return false;
    return true;
  });

  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const buildExportRows = () => {
    const deptMap = new Map((lookups?.departments ?? []).map((d: any) => [d.id, d.name_ar]));
    const progMap = new Map((lookups?.programs ?? []).map((p: any) => [p.id, p.name_ar]));
    return filtered.map((r: any) => ({
      employee_number: r.employee_number ?? "",
      full_name_ar: r.full_name_ar ?? "",
      full_name_en: r.full_name_en ?? "",
      department: r.department_id ? (deptMap.get(r.department_id) ?? "") : "",
      program: r.program_id ? (progMap.get(r.program_id) ?? "") : "",
      academic_rank: r.academic_rank ?? "",
      position_title: r.position_title ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      status: r.status === "active" ? "نشط" : "معطّل",
    }));
  };

  const columns = [
    { key: "employee_number", header: "الرقم الوظيفي", width: 14 },
    { key: "full_name_ar", header: "الاسم بالعربية", width: 28 },
    { key: "full_name_en", header: "الاسم بالإنجليزية", width: 28 },
    { key: "department", header: "القسم", width: 22 },
    { key: "program", header: "البرنامج", width: 22 },
    { key: "academic_rank", header: "الرتبة العلمية", width: 16 },
    { key: "position_title", header: "المنصب", width: 18 },
    { key: "email", header: "البريد الإلكتروني", width: 28 },
    { key: "phone", header: "الهاتف", width: 14 },
    { key: "status", header: "الحالة", width: 10 },
  ] as const;

  const handleExportExcel = async () => {
    setExporting("xlsx");
    try {
      const data = buildExportRows();
      await exportToExcel({
        filename: buildFilename("faculty_members_export", "xlsx").replace(/\.xlsx$/, ""),
        sheetName: "أعضاء هيئة التدريس",
        columns: columns.map((c) => ({
          header: c.header,
          accessor: (r: any) => r[c.key],
          width: c.width,
        })),
        rows: data,
      });
    } catch (e: any) {
      setError(e?.message ?? "تعذّر تصدير Excel");
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    setExporting("pdf");
    try {
      const data = buildExportRows();
      const { data: userData } = await supabase.auth.getUser();
      await exportToPdf({
        filename: buildFilename("faculty_members_export", "pdf").replace(/\.pdf$/, ""),
        title: "قائمة أعضاء هيئة التدريس",
        subtitle: "كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ",
        exportedBy: userData.user?.email ?? null,
        logoUrl: "/favicon.ico",
        columns: columns.map((c) => ({
          header: c.header,
          accessor: (r: any) => r[c.key],
        })),
        rows: data,
      });
    } catch (e: any) {
      setError(e?.message ?? "تعذّر تصدير PDF");
    } finally {
      setExporting(null);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary flex items-center gap-2">
            <Users className="h-7 w-7" /> إدارة أعضاء هيئة التدريس
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إضافة الأعضاء، تعديل البيانات، إنشاء حسابات الدخول، وإعادة تعيين كلمات المرور.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportExcel}
            disabled={exporting !== null || filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {exporting === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            تصدير Excel
          </button>
          <button
            onClick={handleExportPdf}
            disabled={exporting !== null || filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            تصدير PDF
          </button>
          <Link
            to="/admin/imports"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-primary hover:bg-secondary"
          >
            <Upload className="h-4 w-4" /> استيراد جماعي
          </Link>
          <button
            onClick={() => { setShowAdd(true); setError(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:opacity-90 shadow-sm"
          >
            <Plus className="h-4 w-4" /> إضافة عضو هيئة تدريس
          </button>
        </div>
      </div>


      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="إخفاء"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="rounded-xl bg-card border border-border p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الرقم الوظيفي..."
              className="w-full rounded-lg border border-border bg-background pr-10 px-3 py-2 text-sm"
            />
          </div>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">كل الأقسام</option>
            {lookups?.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value as any)}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm">
              <option value="all">الكل</option>
              <option value="active">نشط</option>
              <option value="inactive">معطّل</option>
            </select>
            <select value={hasAccount} onChange={(e) => setHasAccount(e.target.value as any)}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm">
              <option value="all">حساب: الكل</option>
              <option value="yes">يملك حساب</option>
              <option value="no">بلا حساب</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            لا يوجد أعضاء. ابدأ بالضغط على «إضافة عضو هيئة تدريس».
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-primary">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">الاسم</th>
                  <th className="px-4 py-3 text-right font-bold">الرقم الوظيفي</th>
                  <th className="px-4 py-3 text-right font-bold">الرتبة</th>
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
                      <td className="px-4 py-3 text-xs">{r.academic_rank || "—"}</td>
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
                          {!hasAcc ? (
                            <button disabled={!!busy}
                              onClick={() => run(`create-${r.id}`, async () => {
                                const res = await create({ data: { kind: "faculty", profile_id: r.id } });
                                setSlip({
                                  portal: "faculty",
                                  full_name_ar: r.full_name_ar,
                                  identifier: r.employee_number,
                                  email: res.email,
                                  password: r.employee_number,
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
                                  await reset({ data: { kind: "faculty", profile_id: r.id } });
                                  setSlip({
                                    portal: "faculty",
                                    full_name_ar: r.full_name_ar,
                                    identifier: r.employee_number,
                                    email: r.email,
                                    password: r.employee_number,
                                  });
                                }, refresh)}
                                className="inline-flex items-center gap-1 rounded border border-border hover:bg-secondary px-2 py-1 text-xs">
                                {busy === `reset-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                                إعادة تعيين
                              </button>
                              <button disabled={!!busy}
                                onClick={() => run(`toggle-${r.id}`, () => toggle({ data: { kind: "faculty", profile_id: r.id, active: !isActive } }), refresh)}
                                className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                                  isActive
                                    ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                                    : "border-green-500/30 text-green-700 hover:bg-green-500/10"
                                }`}>
                                {busy === `toggle-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : isActive ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                                {isActive ? "تعطيل" : "تفعيل"}
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

      {showAdd && lookups && (
        <AddFacultyModal
          lookups={lookups}
          onClose={() => setShowAdd(false)}
          onCreated={(res) => {
            setShowAdd(false);
            refresh();
            if (res.credentials) {
              setSlip({
                portal: "faculty",
                full_name_ar: res.full_name_ar,
                identifier: res.employee_number,
                email: res.credentials.email,
                password: res.credentials.password,
              });
            }
          }}
        />
      )}

      {editId && (
        <EditFacultyModal
          memberId={editId}
          lookups={lookups}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); refresh(); }}
        />
      )}

      {slip && <CredentialsSlip slip={slip} onClose={() => setSlip(null)} />}
    </div>
  );
}

const RANKS = ["أستاذ", "أستاذ مشارك", "أستاذ مساعد", "محاضر", "معيد"];

function AddFacultyModal({
  lookups,
  onClose,
  onCreated,
}: {
  lookups: Lookups;
  onClose: () => void;
  onCreated: (res: Awaited<ReturnType<ReturnType<typeof useServerFn<typeof createFacultyMember>>>>) => void;
}) {
  const createFn = useServerFn(createFacultyMember);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    employee_number: "",
    full_name_ar: "",
    full_name_en: "",
    department_id: "",
    program_id: "",
    academic_rank: RANKS[2],
    position_title: "",
    email: "",
    phone: "",
    status: "active" as "active" | "inactive",
    create_login: true,
  });

  const filteredPrograms = form.department_id
    ? lookups.programs.filter((p: any) => p.department_id === form.department_id)
    : lookups.programs;

  const update = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await createFn({ data: {
        ...form,
        full_name_en: form.full_name_en || undefined,
        program_id: form.program_id || undefined,
        position_title: form.position_title || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
      } as any });
      onCreated(res);
    } catch (e: any) {
      setErr(e?.message ?? "تعذّر إنشاء العضو");
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
            <Plus className="h-5 w-5" /> إضافة عضو هيئة تدريس
          </h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-secondary rounded"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <Section title="البيانات الأساسية">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الرقم الوظيفي *">
                <input required value={form.employee_number} onChange={(e) => update("employee_number", e.target.value)}
                  dir="ltr" placeholder="F0001" pattern="[A-Za-z0-9_-]+"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
              </Field>
              <Field label="الرتبة العلمية *">
                <select required value={form.academic_rank} onChange={(e) => update("academic_rank", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
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
              <Field label="القسم *">
                <select required value={form.department_id} onChange={(e) => { update("department_id", e.target.value); update("program_id", ""); }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">— اختر —</option>
                  {lookups.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
                </select>
              </Field>
              <Field label="البرنامج">
                <select value={form.program_id} onChange={(e) => update("program_id", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">— اختر —</option>
                  {filteredPrograms.map((p: any) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
                </select>
              </Field>
              <Field label="المنصب">
                <input value={form.position_title} onChange={(e) => update("position_title", e.target.value)}
                  placeholder="مثل: رئيس القسم"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="الحالة">
                <select value={form.status} onChange={(e) => update("status", e.target.value as any)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="active">نشط</option>
                  <option value="inactive">معطّل</option>
                </select>
              </Field>
              <Field label="البريد الإلكتروني">
                <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} dir="ltr"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="الهاتف">
                <input value={form.phone} onChange={(e) => update("phone", e.target.value)} dir="ltr"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
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
                  سيتم إنشاء بريد <span dir="ltr" className="font-mono">[رقم]@faculty.usr.edu.ye</span> وكلمة مرور أولية = الرقم الوظيفي،
                  مع إجبار العضو على تغييرها عند أول دخول.
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

function EditFacultyModal({
  memberId,
  lookups,
  onClose,
  onSaved,
}: {
  memberId: string;
  lookups: Lookups | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const getFn = useServerFn(getFacultyMember);
  const updateFn = useServerFn(updateFacultyMember);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: member, isLoading } = useQuery({
    queryKey: ["admin-faculty-detail", memberId],
    queryFn: () => getFn({ data: { id: memberId } }),
  });

  const [form, setForm] = useState<any>(null);
  if (member && !form) {
    setForm({
      full_name_ar: (member as any).full_name_ar ?? "",
      full_name_en: (member as any).full_name_en ?? "",
      department_id: (member as any).department_id ?? "",
      program_id: (member as any).program_id ?? "",
      academic_rank: (member as any).academic_rank ?? RANKS[2],
      position_title: (member as any).position_title ?? "",
      email: (member as any).faculty?.email ?? "",
      phone: (member as any).faculty?.phone ?? "",
      status: (member as any).status ?? "active",
    });
  }

  const update = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await updateFn({ data: { id: memberId, ...form } });
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
            <Pencil className="h-5 w-5" /> تعديل بيانات العضو
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
                <span className="font-mono font-bold">{(member as any)?.employee_number}</span>
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
                <Field label="الرتبة العلمية *">
                  <select required value={form.academic_rank} onChange={(e) => update("academic_rank", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="المنصب">
                  <input value={form.position_title} onChange={(e) => update("position_title", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </Field>
                {lookups && (
                  <>
                    <Field label="القسم *">
                      <select required value={form.department_id} onChange={(e) => { update("department_id", e.target.value); update("program_id", ""); }}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="">— اختر —</option>
                        {lookups.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
                      </select>
                    </Field>
                    <Field label="البرنامج">
                      <select value={form.program_id} onChange={(e) => update("program_id", e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="">— اختر —</option>
                        {lookups.programs
                          .filter((p: any) => !form.department_id || p.department_id === form.department_id)
                          .map((p: any) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
                      </select>
                    </Field>
                  </>
                )}
                <Field label="البريد">
                  <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} dir="ltr"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="الهاتف">
                  <input value={form.phone} onChange={(e) => update("phone", e.target.value)} dir="ltr"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </Field>
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
