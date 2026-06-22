import { createLazyFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePagePerf } from "@/lib/perf-probe";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, Search, Loader2, X, Pencil, KeyRound, UserCheck, UserX, Printer,
  GraduationCap, Upload, CheckCircle2, Copy, Unlink,
} from "lucide-react";
import { listUsers, createAccount, resetPassword, setActive, removeLoginAccount } from "@/lib/admin-users.functions";
import { canWriteStudents, studentsNavLabel } from "@/lib/admin-nav";

const UNLINK_LOGIN_CONFIRM =
  "سيتم فك ربط حساب الدخول فقط. لن يُحذف الملف الأكاديمي أو المالي أو الإداري. يمكن إنشاء حساب دخول جديد لاحقاً.\n\nهل تريد المتابعة؟";
import {
  getStudentLookups, createStudent, updateStudent, getStudent,
} from "@/lib/admin-students.functions";

export const Route = createLazyFileRoute("/admin/students")({
  component: StudentsPage,
});

type LookupData = Awaited<ReturnType<typeof getStudentLookups>>;

function StudentsPage() {
  usePagePerf("/admin/students");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // PERFORMANCE-FIX-02A: server-side pagination
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const [credentialsSlip, setCredentialsSlip] = useState<{
    full_name_ar: string;
    academic_number: string;
    email: string;
    password: string;
  } | null>(null);

  const list = useServerFn(listUsers);
  const create = useServerFn(createAccount);
  const reset = useServerFn(resetPassword);
  const toggle = useServerFn(setActive);
  const removeLogin = useServerFn(removeLoginAccount);
  const lookupsFn = useServerFn(getStudentLookups);

  const qc = useQueryClient();

  const { adminSession } = useRouteContext({ from: "/admin" });
  const userRoles = adminSession?.roles ?? [];
  const canWrite = canWriteStudents(userRoles);
  const pageTitle = studentsNavLabel(userRoles);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, status]);
  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-students", search, status, page],
    queryFn: () => list({ data: { kind: "student", search: search || undefined, status, page, pageSize: PAGE_SIZE } }),
  });
  const total = (rows as any)?.__total ?? rows?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const { data: lookups } = useQuery({
    queryKey: ["admin-student-lookups"],
    queryFn: () => lookupsFn(),
    staleTime: Infinity,
    enabled: canWrite,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-students"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setError(null);
    try { await fn(); refresh(); }
    catch (e: any) { setError(e?.message ?? "خطأ"); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary flex items-center gap-2">
            <GraduationCap className="h-7 w-7" /> {pageTitle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canWrite
              ? "إضافة الطلاب، تعديل البيانات، إنشاء حسابات الدخول، وإعادة تعيين كلمات المرور."
              : "عرض قائمة الطلاب والبحث والفلاتر — صلاحية قراءة فقط."}
          </p>
        </div>
        {canWrite && (
        <div className="flex gap-2">
          <Link
            to="/admin/imports"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-primary hover:bg-secondary"
          >
            <Upload className="h-4 w-4" /> استيراد من Excel
          </Link>
          <button
            onClick={() => { setShowAdd(true); setError(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:opacity-90 shadow-sm"
          >
            <Plus className="h-4 w-4" /> إضافة طالب جديد
          </button>
        </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="إخفاء"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl bg-card border border-border p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الرقم الأكاديمي..."
              className="w-full rounded-lg border border-border bg-background pr-10 px-3 py-2 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
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
          <div className="p-12 text-center text-muted-foreground text-sm">
            {canWrite
              ? "لا يوجد طلاب. ابدأ بالضغط على «إضافة طالب جديد»."
              : "لا يوجد طلاب مطابقون للبحث."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-primary">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">الاسم</th>
                  <th className="px-4 py-3 text-right font-bold">الرقم الأكاديمي</th>
                  <th className="px-4 py-3 text-right font-bold">حساب الدخول</th>
                  <th className="px-4 py-3 text-right font-bold">الحالة</th>
                  {canWrite && (
                    <th className="px-4 py-3 text-right font-bold">إجراءات</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const hasAccount = !!r.user_id;
                  const isActive = r.status === "active";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-3 font-bold">{r.full_name_ar}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.academic_number}</td>
                      <td className="px-4 py-3 text-xs">
                        {hasAccount ? (
                          <span>
                            <span className="text-muted-foreground">اسم المستخدم: </span>
                            <span className="font-mono font-bold" dir="ltr">{r.academic_number}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">— لا يوجد</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                          isActive ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"
                        }`}>
                          {isActive ? "نشط" : "معطّل"}
                        </span>
                      </td>
                      {canWrite && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={() => setEditId(r.id)}
                            className="inline-flex items-center gap-1 rounded border border-border hover:bg-secondary px-2 py-1 text-xs"
                            title="تعديل"
                          >
                            <Pencil className="h-3 w-3" /> تعديل
                          </button>
                          {!hasAccount ? (
                            <button
                              disabled={!!busy}
                              onClick={() => run(`create-${r.id}`, async () => {
                                const res = await create({ data: { kind: "student", profile_id: r.id } });
                                setCredentialsSlip({
                                  full_name_ar: r.full_name_ar,
                                  academic_number: r.academic_number,
                                  email: res.email,
                                  password: res.password ?? "— (حساب Auth موجود مسبقاً)",
                                });
                              })}
                              className="inline-flex items-center gap-1 rounded border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 px-2 py-1 text-xs font-bold"
                            >
                              {busy === `create-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                              إنشاء حساب
                            </button>
                          ) : (
                            <>
                              <button
                                disabled={!!busy}
                                onClick={() => run(`reset-${r.id}`, async () => {
                                  const res = await reset({ data: { kind: "student", profile_id: r.id } });
                                  setCredentialsSlip({
                                    full_name_ar: r.full_name_ar,
                                    academic_number: r.academic_number,
                                    email: r.email,
                                    password: res.password,
                                  });
                                })}
                                className="inline-flex items-center gap-1 rounded border border-border hover:bg-secondary px-2 py-1 text-xs"
                              >
                                {busy === `reset-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                                إعادة تعيين
                              </button>
                              <button
                                disabled={!!busy}
                                onClick={() => run(`toggle-${r.id}`, () => toggle({ data: { kind: "student", profile_id: r.id, active: !isActive } }))}
                                className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                                  isActive
                                    ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                                    : "border-green-500/30 text-green-700 hover:bg-green-500/10"
                                }`}
                              >
                                {busy === `toggle-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : isActive ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                                {isActive ? "تعطيل" : "تفعيل"}
                              </button>
                              <button
                                disabled={!!busy}
                                onClick={() => {
                                  if (!confirm(`فك ربط حساب الدخول لـ «${r.full_name_ar}»؟\n\n${UNLINK_LOGIN_CONFIRM}`)) return;
                                  run(`unlink-${r.id}`, () => removeLogin({ data: { kind: "student", profile_id: r.id } }));
                                }}
                                className="inline-flex items-center gap-1 rounded border border-amber-500/40 text-amber-800 hover:bg-amber-500/10 px-2 py-1 text-xs"
                              >
                                {busy === `unlink-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
                                فك ربط الدخول
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="text-muted-foreground">
            عرض {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} من {total}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-border px-3 py-1 disabled:opacity-40 hover:bg-secondary"
            >السابق</button>
            <span className="px-2 font-mono text-xs text-muted-foreground">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded border border-border px-3 py-1 disabled:opacity-40 hover:bg-secondary"
            >التالي</button>
          </div>
        </div>
      )}



      {showAdd && canWrite && lookups && (
        <AddStudentModal
          lookups={lookups}
          onClose={() => setShowAdd(false)}
          onCreated={(res) => {
            setShowAdd(false);
            refresh();
            if (res.credentials) {
              setCredentialsSlip({
                full_name_ar: res.full_name_ar,
                academic_number: res.academic_number,
                email: res.credentials.email,
                password: res.credentials.password,
              });
            }
          }}
        />
      )}

      {editId && canWrite && (
        <EditStudentModal
          studentId={editId}
          lookups={lookups}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); refresh(); }}
        />
      )}

      {credentialsSlip && (
        <CredentialsSlip slip={credentialsSlip} onClose={() => setCredentialsSlip(null)} />
      )}
    </div>
  );
}

// ============= ADD MODAL =============

function AddStudentModal({
  lookups,
  onClose,
  onCreated,
}: {
  lookups: LookupData;
  onClose: () => void;
  onCreated: (res: Awaited<ReturnType<ReturnType<typeof useServerFn<typeof createStudent>>>>) => void;
}) {
  const createFn = useServerFn(createStudent);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const currentYear = useMemo(() => lookups.academic_years.find((y: any) => y.is_current) ?? lookups.academic_years[0], [lookups]);
  const currentSem = useMemo(() => lookups.semesters.find((s: any) => s.is_current) ?? lookups.semesters[0], [lookups]);

  const [form, setForm] = useState({
    academic_number: "",
    full_name_ar: "",
    full_name_en: "",
    phone: "",
    email: "",
    national_id: "",
    department_id: "",
    program_id: "",
    level_id: lookups.levels[0]?.id ?? "",
    academic_year_id: currentYear?.id ?? "",
    semester_id: currentSem?.id ?? "",
    create_login: true,
  });

  const filteredPrograms = form.department_id
    ? lookups.programs.filter((p: any) => p.department_id === form.department_id)
    : lookups.programs;
  const filteredSemesters = form.academic_year_id
    ? lookups.semesters.filter((s: any) => s.academic_year_id === form.academic_year_id)
    : lookups.semesters;

  const update = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const payload = {
        ...form,
        full_name_en: form.full_name_en || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        national_id: form.national_id || undefined,
        department_id: form.department_id || undefined,
        program_id: form.program_id || undefined,
      };
      const res = await createFn({ data: payload as any });
      onCreated(res);
    } catch (e: any) {
      setErr(e?.message ?? "تعذّر إنشاء الطالب");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h3 className="font-display text-lg font-bold text-primary flex items-center gap-2">
            <Plus className="h-5 w-5" /> إضافة طالب جديد
          </h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-secondary rounded" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Identity */}
          <Section title="بيانات الطالب">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الرقم الأكاديمي *">
                <input required value={form.academic_number} onChange={(e) => update("academic_number", e.target.value)}
                  dir="ltr" placeholder="20240001"
                  pattern="[A-Za-z0-9_-]+"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
              </Field>
              <Field label="رقم الهوية الوطنية">
                <input value={form.national_id} onChange={(e) => update("national_id", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="الاسم بالعربية *">
                <input required minLength={2} value={form.full_name_ar} onChange={(e) => update("full_name_ar", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="الاسم بالإنجليزية">
                <input value={form.full_name_en} onChange={(e) => update("full_name_en", e.target.value)}
                  dir="ltr"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="الهاتف">
                <input value={form.phone} onChange={(e) => update("phone", e.target.value)}
                  dir="ltr" placeholder="+967..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="البريد الإلكتروني الشخصي">
                <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)}
                  dir="ltr"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </Field>
            </div>
          </Section>

          {/* Academic */}
          <Section title="البيانات الأكاديمية">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="القسم">
                <select value={form.department_id} onChange={(e) => { update("department_id", e.target.value); update("program_id", ""); }}
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
              <Field label="المستوى *">
                <select required value={form.level_id} onChange={(e) => update("level_id", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">— اختر —</option>
                  {lookups.levels.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="السنة الأكاديمية *">
                <select required value={form.academic_year_id} onChange={(e) => { update("academic_year_id", e.target.value); update("semester_id", ""); }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">— اختر —</option>
                  {lookups.academic_years.map((y: any) => (
                    <option key={y.id} value={y.id}>{y.name}{y.is_current ? " (الحالية)" : ""}</option>
                  ))}
                </select>
              </Field>
              <Field label="الفصل *">
                <select required value={form.semester_id} onChange={(e) => update("semester_id", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">— اختر —</option>
                  {filteredSemesters.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}{s.is_current ? " (الحالي)" : ""}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          {/* Login */}
          <Section title="حساب الدخول">
            <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3 cursor-pointer">
              <input type="checkbox" checked={form.create_login} onChange={(e) => update("create_login", e.target.checked)}
                className="mt-0.5 h-4 w-4" />
              <div className="text-sm">
                <div className="font-bold text-primary">إنشاء حساب دخول للطالب</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  اسم الدخول للطالب هو الرقم الأكاديمي. تُنشأ كلمة مرور مؤقتة عشوائية وتُعرض للمسؤول مرة واحدة فقط، ويجب على الطالب تغييرها عند أول دخول.
                </div>
              </div>
            </label>
          </Section>

          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">{err}</div>
          )}
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2 shrink-0 bg-secondary/30">
          <button type="button" onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold">إلغاء</button>
          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} حفظ الطالب
          </button>
        </div>
      </form>
    </div>
  );
}

// ============= EDIT MODAL =============

function EditStudentModal({
  studentId,
  lookups,
  onClose,
  onSaved,
}: {
  studentId: string;
  lookups: LookupData | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const getFn = useServerFn(getStudent);
  const updateFn = useServerFn(updateStudent);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: student, isLoading } = useQuery({
    queryKey: ["admin-student-detail", studentId],
    queryFn: () => getFn({ data: { id: studentId } }),
  });

  const [form, setForm] = useState<any>(null);
  if (student && !form) {
    setForm({
      full_name_ar: student.full_name_ar ?? "",
      full_name_en: student.full_name_en ?? "",
      phone: student.phone ?? "",
      email: student.email ?? "",
      national_id: student.national_id ?? "",
      department_id: student.department_id ?? "",
      program_id: student.program_id ?? "",
    });
  }

  const update = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await updateFn({ data: { id: studentId, ...form } });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "تعذّر التحديث");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h3 className="font-display text-lg font-bold text-primary flex items-center gap-2">
            <Pencil className="h-5 w-5" /> تعديل بيانات الطالب
          </h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-secondary rounded"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {isLoading || !form ? (
            <div className="p-8 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="rounded-lg bg-secondary/50 px-3 py-2 text-xs">
                <span className="text-muted-foreground">الرقم الأكاديمي:</span>{" "}
                <span className="font-mono font-bold">{student?.academic_number}</span>
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
                <Field label="الهاتف">
                  <input value={form.phone} onChange={(e) => update("phone", e.target.value)} dir="ltr"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="البريد الشخصي">
                  <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} dir="ltr"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="رقم الهوية">
                  <input value={form.national_id} onChange={(e) => update("national_id", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </Field>
                {lookups && (
                  <>
                    <Field label="القسم">
                      <select value={form.department_id} onChange={(e) => { update("department_id", e.target.value); update("program_id", ""); }}
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

// ============= CREDENTIALS SLIP =============

function CredentialsSlip({
  slip,
  onClose,
}: {
  slip: { full_name_ar: string; academic_number: string; email: string; password: string };
  onClose: () => void;
}) {
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  };

  const handlePrint = () => {
    const w = window.open("", "_blank", "width=600,height=700");
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>بيانات الدخول</title>
      <style>
        body{font-family:Tahoma,Arial,sans-serif;padding:32px;color:#0f172a;}
        h1{font-size:18px;margin:0 0 8px;text-align:center;}
        h2{font-size:14px;margin:0 0 24px;text-align:center;color:#64748b;font-weight:normal;}
        .box{border:2px solid #0f3460;border-radius:8px;padding:20px;margin-top:16px;}
        .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #e2e8f0;font-size:14px;}
        .row:last-child{border:0;}
        .k{color:#64748b;}
        .v{font-weight:bold;font-family:'Courier New',monospace;direction:ltr;}
        .note{margin-top:16px;font-size:11px;color:#64748b;line-height:1.7;text-align:right;}
      </style></head><body>
      <h1>كلية تكنولوجيا المعلومات وعلوم الحاسوب</h1>
      <h2>بيانات الدخول إلى البوابة الإلكترونية</h2>
      <div class="box">
        <div class="row"><span class="k">الاسم:</span><span>${slip.full_name_ar}</span></div>
        <div class="row"><span class="k">الرقم الأكاديمي:</span><span class="v">${slip.academic_number}</span></div>
        <div class="row"><span class="k">اسم الدخول:</span><span class="v">${slip.academic_number}</span></div>
        <div class="row"><span class="k">كلمة المرور المؤقتة:</span><span class="v">${slip.password}</span></div>
      </div>
      <p class="note">
        • يُرجى الدخول إلى البوابة عبر <strong>/portal-login</strong> واختيار «طالب».<br>
        • تُنشأ كلمة المرور المؤقتة عشوائياً وتُعرض للمسؤول مرة واحدة فقط.<br>
        • سيُطلب من الطالب تغيير كلمة المرور عند أول دخول.<br>
        • لا تشارك بيانات الدخول مع أي شخص.
      </p>
      <script>window.onload=()=>{window.print();}</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-l from-emerald-600 to-emerald-700 px-5 py-4 text-white flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" />
          <h3 className="font-display text-lg font-bold">تم بنجاح</h3>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            احفظ بيانات الدخول التالية وسلّمها للطالب. كلمة المرور المؤقتة تُعرض مرة واحدة فقط:
          </p>
          <div className="rounded-lg border-2 border-primary/20 bg-secondary/30 p-4 space-y-2.5 text-sm">
            <SlipRow label="الاسم" value={slip.full_name_ar} />
            <SlipRow label="الرقم الأكاديمي" value={slip.academic_number} mono onCopy={() => copy(slip.academic_number)} />
            <SlipRow label="اسم الدخول" value={slip.academic_number} mono onCopy={() => copy(slip.academic_number)} />
            <SlipRow label="كلمة المرور المؤقتة" value={slip.password} mono onCopy={() => copy(slip.password)} />
            
          </div>
          <p className="text-xs text-muted-foreground">
            تُنشأ كلمة المرور المؤقتة عشوائياً وتُعرض هنا مرة واحدة. سيُطلب من الطالب تغييرها عند أول دخول.
          </p>
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-2 bg-secondary/30">
          <button onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold">إغلاق</button>
          <button onClick={handlePrint} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-bold hover:opacity-90">
            <Printer className="h-4 w-4" /> طباعة إشعار بيانات الدخول
          </button>
        </div>
      </div>
    </div>
  );
}

function SlipRow({ label, value, mono, onCopy }: { label: string; value: string; mono?: boolean; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-dashed border-border last:border-0 pb-2 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`${mono ? "font-mono" : ""} font-bold`} dir={mono ? "ltr" : undefined}>{value}</span>
        {onCopy && (
          <button onClick={onCopy} className="p-1 hover:bg-secondary rounded text-muted-foreground" aria-label="نسخ" title="نسخ">
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-extrabold text-primary mb-3 pb-1 border-b border-border">{title}</h4>
      {children}
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
