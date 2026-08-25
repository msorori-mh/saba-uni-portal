import { createLazyFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePagePerf } from "@/lib/perf-probe";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, Search, Loader2, X, Pencil, KeyRound, UserCheck, UserX, Printer,
  GraduationCap, Upload, CheckCircle2, Copy, Unlink, AlertTriangle, FileSpreadsheet,
} from "lucide-react";
import { createAccount, resetPassword, setActive, removeLoginAccount } from "@/lib/admin-users.functions";
import { canWriteStudents, studentsNavLabel } from "@/lib/admin-nav";
import {
  isStudentUniversityEmail,
  validateStudentUniversityEmailInput,
  STUDENT_UNIVERSITY_EMAIL_SUFFIX,
} from "@/lib/university-email-auth";

const UNLINK_LOGIN_CONFIRM =
  "سيتم فك ربط حساب الدخول فقط. لن يُحذف الملف الأكاديمي أو المالي أو الإداري. يمكن إنشاء حساب دخول جديد لاحقاً.\n\nهل تريد المتابعة؟";
import {
  getStudentLookups, createStudent, updateStudent, getStudent,
  listStudentLoginBackfillCandidates, provisionStudentLogin, listStudentsForAdmin,
  exportFilteredStudentsToExcel,
} from "@/lib/admin-students.functions";

export const Route = createLazyFileRoute("/admin/students")({
  component: StudentsPage,
});

type LookupData = Awaited<ReturnType<typeof getStudentLookups>>;
type AdminStudentsResult = Awaited<ReturnType<typeof listStudentsForAdmin>>;
type AdminStudentRow = AdminStudentsResult["rows"][number];
type LoginBackfillPreview = Awaited<ReturnType<typeof listStudentLoginBackfillCandidates>>;
type BackfillCandidate = LoginBackfillPreview["rows"][number];
type BackfillProgress = {
  total: number;
  processed: number;
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ academic_number: string; message: string }>;
};

function studySystemLabel(value: string | null | undefined) {
  if (value === "regular") return "عام";
  if (value === "private") return "نفقة خاصة";
  return "غير محدد";
}

function StudentsPage() {
  usePagePerf("/admin/students");
  const [academicSearch, setAcademicSearch] = useState("");
  const [studentFilters, setStudentFilters] = useState({
    study_system: "all" as "all" | "regular" | "private",
    department_id: "",
    program_id: "",
    level_id: "",
    academic_year_id: "",
    semester_id: "",
    status: "all",
  });
  const [appliedStudentQuery, setAppliedStudentQuery] = useState<{
    academic_number?: string;
    query?: string;
    study_system: "all" | "regular" | "private";
    department_id?: string;
    program_id?: string;
    level_id?: string;
    academic_year_id?: string;
    semester_id?: string;
    status: string;
  }>({
    study_system: "all",
    status: "all",
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  // STUDENT-PROVISIONING-EMAIL-02T: «إنشاء حساب» opens a review dialog first —
  // no account is created on the first click.
  const [provisionTarget, setProvisionTarget] = useState<AdminStudentRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
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

  const listStudents = useServerFn(listStudentsForAdmin);
  const exportStudents = useServerFn(exportFilteredStudentsToExcel);
  const create = useServerFn(createAccount);
  const reset = useServerFn(resetPassword);
  const toggle = useServerFn(setActive);
  const removeLogin = useServerFn(removeLoginAccount);
  const lookupsFn = useServerFn(getStudentLookups);
  const previewBackfill = useServerFn(listStudentLoginBackfillCandidates);
  const provisionLogin = useServerFn(provisionStudentLogin);
  const getStudentFn = useServerFn(getStudent);

  const qc = useQueryClient();

  const { adminSession } = useRouteContext({ from: "/admin" });
  const userRoles = adminSession?.roles ?? [];
  const canWrite = canWriteStudents(userRoles);
  const pageTitle = studentsNavLabel(userRoles);
  const [backfillPreview, setBackfillPreview] = useState<LoginBackfillPreview | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillConfirm, setBackfillConfirm] = useState("");
  const [backfillTestDone, setBackfillTestDone] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<BackfillProgress | null>(null);
  const [backfillCredentials, setBackfillCredentials] = useState<Array<{
    full_name_ar: string;
    academic_number: string;
    email: string;
    password: string;
  }>>([]);
  const [backfillFilters, setBackfillFilters] = useState({
    academicPrefix: "",
    department_id: "",
    program_id: "",
    level_id: "",
    academic_year_id: "",
    semester_id: "",
  });

  const appliedStudentPayload = () => ({
    academic_number: appliedStudentQuery.academic_number || undefined,
    query: appliedStudentQuery.query || undefined,
    study_system: appliedStudentQuery.study_system,
    department_id: appliedStudentQuery.department_id || undefined,
    program_id: appliedStudentQuery.program_id || undefined,
    level_id: appliedStudentQuery.level_id || undefined,
    academic_year_id: appliedStudentQuery.academic_year_id || undefined,
    semester_id: appliedStudentQuery.semester_id || undefined,
    status: appliedStudentQuery.status,
    page,
    pageSize: PAGE_SIZE,
  });

  const appliedStudentExportPayload = () => ({
    academic_number: appliedStudentQuery.academic_number || undefined,
    query: appliedStudentQuery.query || undefined,
    study_system: appliedStudentQuery.study_system,
    department_id: appliedStudentQuery.department_id || undefined,
    program_id: appliedStudentQuery.program_id || undefined,
    level_id: appliedStudentQuery.level_id || undefined,
    academic_year_id: appliedStudentQuery.academic_year_id || undefined,
    semester_id: appliedStudentQuery.semester_id || undefined,
    status: appliedStudentQuery.status,
  });


  const hasAppliedStudentExportFilters = () => Boolean(
    appliedStudentQuery.academic_number?.trim()
    || appliedStudentQuery.query?.trim()
    || (appliedStudentQuery.study_system && appliedStudentQuery.study_system !== "all")
    || appliedStudentQuery.department_id
    || appliedStudentQuery.program_id
    || appliedStudentQuery.level_id
    || appliedStudentQuery.academic_year_id
    || appliedStudentQuery.semester_id
    || (appliedStudentQuery.status && appliedStudentQuery.status !== "all"),
  );

  // Reset page when a new search/filter query is applied.
  useEffect(() => { setPage(1); }, [appliedStudentQuery]);
  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-students", appliedStudentQuery, page],
    queryFn: () => listStudents({ data: appliedStudentPayload() }),
  });
  const studentRows = rows?.rows ?? [];
  const total = rows?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const { data: lookups } = useQuery({
    queryKey: ["admin-student-lookups"],
    queryFn: () => lookupsFn(),
    staleTime: Infinity,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-students"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const updateStudentFilter = (key: keyof typeof studentFilters, value: string) => {
    setStudentFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "department_id" ? { program_id: "" } : {}),
      ...(key === "academic_year_id" ? { semester_id: "" } : {}),
    }));
  };

  const applyAcademicNumberSearch = () => {
    const value = academicSearch.trim();
    if (value.length < 3) {
      setError("أدخل 3 أحرف على الأقل للبحث (رقم أكاديمي أو اسم أو بريد).");
      return;
    }
    setError(null);
    setAppliedStudentQuery({
      query: value,
      study_system: "all",
      status: "all",
    });
  };

  // Live search: auto-apply after the user stops typing (≥3 chars).
  const debouncedAcademicSearch = useDebouncedValue(academicSearch, 300);
  useEffect(() => {
    const value = debouncedAcademicSearch.trim();
    if (value.length >= 3) {
      setAppliedStudentQuery((prev) =>
        prev.query === value && !prev.academic_number
          ? prev
          : { query: value, study_system: "all", status: "all" },
      );
      setError(null);
    } else if (value.length === 0) {
      setAppliedStudentQuery((prev) =>
        prev.query || prev.academic_number
          ? { study_system: "all", status: "all" }
          : prev,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedAcademicSearch]);


  const hasGroupStudentFilter = () => Boolean(
    studentFilters.department_id
    || studentFilters.program_id
    || studentFilters.level_id
    || studentFilters.academic_year_id
    || studentFilters.semester_id
    || studentFilters.status !== "all",
  );

  const applyGroupStudentFilters = () => {
    if (!hasGroupStudentFilter()) {
      setError("اختر فلترًا واحدًا على الأقل أو أدخل الرقم الأكاديمي");
      setAppliedStudentQuery({ study_system: "all", status: "all" });
      return;
    }
    setError(null);
    setAcademicSearch("");
    setAppliedStudentQuery({
      study_system: studentFilters.study_system,
      department_id: studentFilters.department_id || undefined,
      program_id: studentFilters.program_id || undefined,
      level_id: studentFilters.level_id || undefined,
      academic_year_id: studentFilters.academic_year_id || undefined,
      semester_id: studentFilters.semester_id || undefined,
      status: studentFilters.status,
    });
  };

  const clearStudentFilters = () => {
    setAcademicSearch("");
    setStudentFilters({
      study_system: "all",
      department_id: "",
      program_id: "",
      level_id: "",
      academic_year_id: "",
      semester_id: "",
      status: "all",
    });
    setAppliedStudentQuery({ study_system: "all", status: "all" });
    setError(null);
  };

  const downloadExportFile = (fileBase64: string, filename: string) => {
    const binary = atob(fileBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportStudents = async () => {
    if (!hasAppliedStudentExportFilters()) {
      setError("اختر فلترًا واحدًا على الأقل أو أدخل الرقم الأكاديمي قبل التصدير");
      return;
    }
    setExportLoading(true);
    setError(null);
    try {
      const res = await exportStudents({ data: appliedStudentExportPayload() });
      downloadExportFile(res.fileBase64, res.filename);
    } catch (e: any) {
      setError(e?.message ?? "تعذّر تجهيز ملف Excel");
    } finally {
      setExportLoading(false);
    }
  };

  const updateBackfillFilter = (key: keyof typeof backfillFilters, value: string) => {
    setBackfillFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "department_id" ? { program_id: "" } : {}),
      ...(key === "academic_year_id" ? { semester_id: "" } : {}),
    }));
    setBackfillPreview(null);
    setBackfillConfirm("");
    setBackfillTestDone(false);
    setBackfillProgress(null);
    setBackfillCredentials([]);
  };

  const backfillPayload = () => ({
    academicPrefix: backfillFilters.academicPrefix || undefined,
    department_id: backfillFilters.department_id || undefined,
    program_id: backfillFilters.program_id || undefined,
    level_id: backfillFilters.level_id || undefined,
    academic_year_id: backfillFilters.academic_year_id || undefined,
    semester_id: backfillFilters.semester_id || undefined,
  });

  const runBackfillPreview = async (opts?: {
    preserveTestDone?: boolean;
    preserveCredentials?: typeof backfillCredentials;
  }) => {
    setBackfillLoading(true);
    setError(null);
    setBackfillProgress(null);
    setBackfillCredentials(opts?.preserveCredentials ?? []);
    setBackfillTestDone(Boolean(opts?.preserveTestDone));
    try {
      const res = await previewBackfill({ data: backfillPayload() });
      setBackfillPreview(res);
      setBackfillConfirm("");
    } catch (e: any) {
      setBackfillPreview(null);
      setError(e?.message ?? "تعذّرت معاينة الطلاب بدون حساب");
    } finally {
      setBackfillLoading(false);
    }
  };

  const ensureStillWithoutLogin = async (candidate: BackfillCandidate) => {
    const latest = await getStudentFn({ data: { id: candidate.id } });
    if ((latest as any).user_id) {
      return { ok: false as const, reason: "تم تخطي الطالب لأن لديه حساب دخول الآن" };
    }
    if ((latest as any).academic_number !== candidate.academic_number) {
      return { ok: false as const, reason: "تم تخطي الطالب لأن الرقم الأكاديمي تغيّر" };
    }
    return { ok: true as const };
  };

  const createBackfillLogin = async (candidate: BackfillCandidate) => {
    const guard = await ensureStillWithoutLogin(candidate);
    if (!guard.ok) return { skipped: true as const, reason: guard.reason };
    if (!candidate.email) {
      return {
        skipped: true as const,
        reason: "لا يوجد إيميل جامعي في ملف الطالب — يرجى تحديث البيانات أولاً",
      };
    }
    const res = await provisionLogin({
      data: {
        profile_id: candidate.id,
        academic_number: candidate.academic_number,
        university_email: candidate.email,
        must_change_password: true,
      },
    });
    return {
      skipped: false as const,
      email: res.email,
      password: res.password,
    };
  };

  const runBackfillSingleTest = async () => {
    const candidate = backfillPreview?.rows.find((row) => !row.has_user_id && row.email);
    if (!candidate) {
      setError("لا يوجد طالب بدون حساب ولديه إيميل جامعي في نتائج المعاينة.");
      return;
    }
    setBusy(`backfill-test-${candidate.id}`);
    setError(null);
    try {
      const res = await createBackfillLogin(candidate);
      if (res.skipped) {
        setBackfillProgress({
          total: 1, processed: 1, success: 0, failed: 0, skipped: 1,
          errors: [{ academic_number: candidate.academic_number, message: res.reason }],
        });
        return;
      }
      setBackfillTestDone(true);
      const credential = {
        full_name_ar: candidate.full_name_ar,
        academic_number: candidate.academic_number,
        email: res.email,
        password: res.password,
      };
      setCredentialsSlip(credential);
      setBackfillCredentials([credential]);
      refresh();
      await runBackfillPreview({ preserveTestDone: true, preserveCredentials: [credential] });
    } catch (e: any) {
      setError(e?.message ?? "تعذّر إنشاء حساب الاختبار");
    } finally {
      setBusy(null);
    }
  };

  const runBackfillBulk = async () => {
    if (!backfillPreview || backfillPreview.total === 0) return;
    if (backfillPreview.truncated) {
      setError("نتائج المعاينة أكبر من الحد الآمن للدفعة الواحدة. ضيّق الفلاتر ثم أعد المعاينة.");
      return;
    }
    if (backfillConfirm.trim() !== String(backfillPreview.total)) {
      setError("أدخل عدد الطلاب المتوقع كما هو ظاهر في المعاينة قبل التنفيذ الجماعي.");
      return;
    }
    if (!confirm(`سيتم إنشاء حسابات دخول للطلاب بدون حساب فقط. العدد المتوقع: ${backfillPreview.total}. هل تريد المتابعة؟`)) {
      return;
    }

    const candidates = backfillPreview.rows.filter((row) => !row.has_user_id);
    const nextProgress: BackfillProgress = {
      total: candidates.length,
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };
    const credentials: typeof backfillCredentials = [];
    setBackfillProgress(nextProgress);
    setBackfillCredentials([]);
    setBusy("backfill-bulk");
    setError(null);

    for (const candidate of candidates) {
      try {
        const res = await createBackfillLogin(candidate);
        if (res.skipped) {
          nextProgress.skipped += 1;
          nextProgress.errors.push({ academic_number: candidate.academic_number, message: res.reason });
        } else {
          nextProgress.success += 1;
          credentials.push({
            full_name_ar: candidate.full_name_ar,
            academic_number: candidate.academic_number,
            email: res.email,
            password: res.password,
          });
        }
      } catch (e: any) {
        nextProgress.failed += 1;
        nextProgress.errors.push({
          academic_number: candidate.academic_number,
          message: e?.message ?? "فشل إنشاء الحساب",
        });
      } finally {
        nextProgress.processed += 1;
        setBackfillProgress({ ...nextProgress, errors: [...nextProgress.errors] });
        setBackfillCredentials([...credentials]);
      }
    }

    setBusy(null);
    refresh();
    await runBackfillPreview();
  };

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setError(null);
    try { await fn(); refresh(); }
    catch (e: any) { setError(e?.message ?? "خطأ"); }
    finally { setBusy(null); }
  };

  const backfillPrograms = backfillFilters.department_id && lookups
    ? lookups.programs.filter((p: any) => p.department_id === backfillFilters.department_id)
    : lookups?.programs ?? [];
  const backfillSemesters = backfillFilters.academic_year_id && lookups
    ? lookups.semesters.filter((s: any) => s.academic_year_id === backfillFilters.academic_year_id)
    : lookups?.semesters ?? [];
  const studentFilterPrograms = studentFilters.department_id && lookups
    ? lookups.programs.filter((p: any) => p.department_id === studentFilters.department_id)
    : lookups?.programs ?? [];
  const studentFilterSemesters = studentFilters.academic_year_id && lookups
    ? lookups.semesters.filter((s: any) => s.academic_year_id === studentFilters.academic_year_id)
    : lookups?.semesters ?? [];

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

      {canWrite && lookups && (
        <section className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 shadow-card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-700" /> إنشاء حسابات الدخول المفقودة
              </h2>
              <p className="mt-1 text-xs text-amber-900">
                هذه الأداة تنشئ حسابات دخول فقط للطلاب الموجودين مسبقاً وبدون <span className="font-mono">user_id</span>.
                لا تنشئ سجلات طلاب جديدة ولا تعدّل البيانات الأكاديمية.
              </p>
            </div>
            <div className="rounded-lg border border-amber-300 bg-white/70 px-3 py-2 text-xs text-amber-900 flex items-start gap-2 max-w-md">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>يجب استخدام فلتر واحد على الأقل، ثم اختبار طالب واحد قبل التنفيذ الجماعي.</span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Field label="بادئة الرقم الأكاديمي">
              <input
                value={backfillFilters.academicPrefix}
                onChange={(e) => updateBackfillFilter("academicPrefix", e.target.value)}
                dir="ltr"
                placeholder="مثال: 26"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="القسم">
              <select
                value={backfillFilters.department_id}
                onChange={(e) => updateBackfillFilter("department_id", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">كل الأقسام</option>
                {lookups.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
              </select>
            </Field>
            <Field label="البرنامج">
              <select
                value={backfillFilters.program_id}
                onChange={(e) => updateBackfillFilter("program_id", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">كل البرامج</option>
                {backfillPrograms.map((p: any) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
              </select>
            </Field>
            <Field label="المستوى">
              <select
                value={backfillFilters.level_id}
                onChange={(e) => updateBackfillFilter("level_id", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">كل المستويات</option>
                {lookups.levels.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="العام الجامعي">
              <select
                value={backfillFilters.academic_year_id}
                onChange={(e) => updateBackfillFilter("academic_year_id", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">كل الأعوام</option>
                {lookups.academic_years.map((y: any) => (
                  <option key={y.id} value={y.id}>{y.name}{y.is_current ? " (الحالية)" : ""}</option>
                ))}
              </select>
            </Field>
            <Field label="الفصل">
              <select
                value={backfillFilters.semester_id}
                onChange={(e) => updateBackfillFilter("semester_id", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">كل الفصول</option>
                {backfillSemesters.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}{s.is_current ? " (الحالي)" : ""}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={backfillLoading || busy === "backfill-bulk"}
              onClick={() => runBackfillPreview()}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {backfillLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              معاينة الطلاب بدون حساب
            </button>
            {backfillPreview && (
              <span className="text-sm font-bold text-primary">
                العدد المطابق: {backfillPreview.total.toLocaleString("ar-EG")}
              </span>
            )}
            {backfillPreview?.truncated && (
              <span className="text-xs font-bold text-destructive">
                النتائج أكبر من الحد الآمن؛ ضيّق الفلاتر قبل التنفيذ.
              </span>
            )}
          </div>

          {backfillPreview && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-white overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/60 text-primary">
                    <tr>
                      <th className="px-3 py-2 text-right">الرقم الأكاديمي</th>
                      <th className="px-3 py-2 text-right">الاسم</th>
                      <th className="px-3 py-2 text-right">الإيميل الجامعي</th>
                      <th className="px-3 py-2 text-right">البرنامج</th>
                      <th className="px-3 py-2 text-right">المستوى</th>
                      <th className="px-3 py-2 text-right">الحالة</th>
                      <th className="px-3 py-2 text-right">user_id فارغ؟</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backfillPreview.rows.slice(0, 10).map((row) => (
                      <tr key={row.id} className="border-t border-border/60">
                        <td className="px-3 py-2 font-mono">{row.academic_number}</td>
                        <td className="px-3 py-2 font-bold">{row.full_name_ar}</td>
                        <td className={`px-3 py-2 font-mono ${row.email ? "" : "text-destructive font-bold"}`}>
                          {row.email ?? "غير مسجل"}
                        </td>
                        <td className="px-3 py-2">{row.program_name ?? "—"}{row.program_code ? ` (${row.program_code})` : ""}</td>
                        <td className="px-3 py-2">{row.level_name ?? "—"}{row.level_number != null ? ` — ${row.level_number}` : ""}</td>
                        <td className="px-3 py-2">{row.status}</td>
                        <td className="px-3 py-2 font-bold text-emerald-700">{row.has_user_id ? "لا" : "نعم"}</td>
                      </tr>
                    ))}
                    {backfillPreview.rows.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">لا توجد نتائج مطابقة.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {backfillPreview.total > 0 && !backfillPreview.truncated && (
                <div className="flex flex-wrap items-end gap-3 rounded-lg border border-amber-300 bg-white/80 p-3">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={runBackfillSingleTest}
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/10 disabled:opacity-50"
                  >
                    {busy?.startsWith("backfill-test") ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    إنشاء حساب لطالب واحد للاختبار
                  </button>

                  <Field label="تأكيد العدد قبل التنفيذ الجماعي">
                    <input
                      value={backfillConfirm}
                      onChange={(e) => setBackfillConfirm(e.target.value)}
                      inputMode="numeric"
                      placeholder={`اكتب ${backfillPreview.total}`}
                      className="w-44 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
                    />
                  </Field>

                  <button
                    type="button"
                    disabled={
                      !!busy
                      || !backfillTestDone
                      || backfillConfirm.trim() !== String(backfillPreview.total)
                    }
                    onClick={runBackfillBulk}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                    title={!backfillTestDone ? "أنشئ حساب طالب واحد للاختبار أولاً" : undefined}
                  >
                    {busy === "backfill-bulk" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                    إنشاء حسابات الدخول للطلاب المحددين بدون حساب
                  </button>
                </div>
              )}

              {backfillProgress && (
                <div className="rounded-lg border border-border bg-white p-3 text-sm">
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    <BackfillStat label="الإجمالي" value={backfillProgress.total} />
                    <BackfillStat label="تمت المعالجة" value={backfillProgress.processed} />
                    <BackfillStat label="نجح" value={backfillProgress.success} tone="ok" />
                    <BackfillStat label="فشل" value={backfillProgress.failed} tone="bad" />
                    <BackfillStat label="تم تخطيه" value={backfillProgress.skipped} />
                  </div>
                  {backfillProgress.errors.length > 0 && (
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer font-bold text-destructive">أخطاء/تخطي ({backfillProgress.errors.length})</summary>
                      <ul className="mt-2 list-disc pr-5 space-y-1">
                        {backfillProgress.errors.slice(0, 50).map((item) => (
                          <li key={`${item.academic_number}-${item.message}`}>
                            <span className="font-mono">{item.academic_number}</span>: {item.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {backfillCredentials.length > 0 && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
                  تم إنشاء {backfillCredentials.length.toLocaleString("ar-EG")} حساب. كلمات المرور المؤقتة تُعرض هنا فقط ولا تُسجّل في logs.
                  <div className="mt-2 max-h-48 overflow-y-auto rounded border border-emerald-200 bg-white">
                    <table className="w-full">
                      <thead className="bg-emerald-100">
                        <tr>
                          <th className="px-2 py-1 text-right">الرقم الأكاديمي</th>
                          <th className="px-2 py-1 text-right">الإيميل الجامعي (اسم الدخول)</th>
                          <th className="px-2 py-1 text-right">كلمة المرور المؤقتة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backfillCredentials.map((item) => (
                          <tr key={item.academic_number} className="border-t border-emerald-100">
                            <td className="px-2 py-1 font-mono">{item.academic_number}</td>
                            <td className="px-2 py-1 font-mono">{item.email}</td>
                            <td className="px-2 py-1 font-mono">{item.password}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl bg-card border border-border p-4 shadow-card space-y-4">
        <div>
          <h2 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
            <Search className="h-5 w-5 text-gold" /> البحث واستعراض الطلاب
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            ابحث عن طالب بالرقم الأكاديمي أو الاسم أو البريد الإلكتروني (تظهر النتائج تلقائياً بعد 3 أحرف)،
            أو استخدم فلترًا أكاديميًا واحدًا على الأقل للاستعراض الجماعي.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Field label="بحث بالرقم الأكاديمي أو الاسم أو البريد">
            <input
              value={academicSearch}
              onChange={(e) => setAcademicSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyAcademicNumberSearch(); }}
              placeholder="مثال: 20250001 أو أحمد أو ahmad@..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <button
            type="button"
            onClick={applyAcademicNumberSearch}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <Search className="h-4 w-4" /> بحث
          </button>
        </div>


        <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>أو استخدم الفلاتر التالية للاستعراض الجماعي</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Field label="نظام الدراسة">
            <select
              value={studentFilters.study_system}
              onChange={(e) => updateStudentFilter("study_system", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">الكل</option>
              <option value="regular">عام</option>
              <option value="private">نفقة خاصة</option>
            </select>
          </Field>
          <Field label="القسم">
            <select
              value={studentFilters.department_id}
              onChange={(e) => updateStudentFilter("department_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">كل الأقسام</option>
              {lookups?.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
            </select>
          </Field>
          <Field label="البرنامج">
            <select
              value={studentFilters.program_id}
              onChange={(e) => updateStudentFilter("program_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">كل البرامج</option>
              {studentFilterPrograms.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name_ar}{p.code ? ` (${p.code})` : ""}</option>
              ))}
            </select>
          </Field>
          <Field label="المستوى">
            <select
              value={studentFilters.level_id}
              onChange={(e) => updateStudentFilter("level_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">كل المستويات</option>
              {lookups?.levels.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="العام الأكاديمي">
            <select
              value={studentFilters.academic_year_id}
              onChange={(e) => updateStudentFilter("academic_year_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">كل الأعوام</option>
              {lookups?.academic_years.map((y: any) => (
                <option key={y.id} value={y.id}>{y.name}{y.is_current ? " (الحالية)" : ""}</option>
              ))}
            </select>
          </Field>
          <Field label="الفصل الدراسي">
            <select
              value={studentFilters.semester_id}
              onChange={(e) => updateStudentFilter("semester_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">كل الفصول</option>
              {studentFilterSemesters.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>
              ))}
            </select>
          </Field>
          <Field label="الحالة">
            <select
              value={studentFilters.status}
              onChange={(e) => updateStudentFilter("status", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="inactive">معطّل</option>
              <option value="suspended">موقوف</option>
              <option value="graduated">متخرج</option>
              <option value="withdrawn">منسحب</option>
              <option value="transferred">محول</option>
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={applyGroupStudentFilters}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <Search className="h-4 w-4" /> استعراض الطلاب
          </button>
          <button
            type="button"
            onClick={handleExportStudents}
            disabled={exportLoading || !hasAppliedStudentExportFilters()}
            title={!hasAppliedStudentExportFilters() ? "طبّق فلترًا واحدًا على الأقل قبل التصدير" : undefined}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          >
            {exportLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FileSpreadsheet className="h-4 w-4" />}
            {exportLoading ? "جاري تجهيز ملف Excel..." : "تصدير Excel"}
          </button>
          <button
            type="button"
            onClick={clearStudentFilters}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-primary hover:bg-secondary"
          >
            <X className="h-4 w-4" /> مسح الفلاتر
          </button>
        </div>
      </section>

      {/* Table */}
      <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : studentRows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {rows?.message ?? "لا يوجد طلاب مطابقون للبحث."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-primary">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">الاسم</th>
                  <th className="px-4 py-3 text-right font-bold">الرقم الأكاديمي</th>
                  <th className="px-4 py-3 text-right font-bold">نظام الدراسة</th>
                  <th className="px-4 py-3 text-right font-bold">القسم</th>
                  <th className="px-4 py-3 text-right font-bold">البرنامج</th>
                  <th className="px-4 py-3 text-right font-bold">المستوى</th>
                  <th className="px-4 py-3 text-right font-bold">العام</th>
                  <th className="px-4 py-3 text-right font-bold">الفصل</th>
                  <th className="px-4 py-3 text-right font-bold">حساب الدخول</th>
                  <th className="px-4 py-3 text-right font-bold">الحالة</th>
                  {canWrite && (
                    <th className="px-4 py-3 text-right font-bold">إجراءات</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {studentRows.map((r: AdminStudentRow) => {
                  const hasAccount = !!r.user_id;
                  const isActive = r.status === "active";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-3 font-bold">{r.full_name_ar}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.academic_number}</td>
                      <td className="px-4 py-3 text-xs">{studySystemLabel(r.study_system)}</td>
                      <td className="px-4 py-3 text-xs">{r.department_name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.program_name ?? "—"}{r.program_code ? ` (${r.program_code})` : ""}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.level_name ?? "—"}{r.level_number != null ? ` — ${r.level_number}` : ""}
                      </td>
                      <td className="px-4 py-3 text-xs">{r.academic_year ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">{r.semester ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        {hasAccount ? (
                          <span>
                            <span className="text-emerald-700 font-bold">لديه حساب</span>
                            <span className="text-muted-foreground"> — اسم المستخدم: </span>
                            <span className="font-mono font-bold" dir="ltr">{r.academic_number}</span>
                          </span>
                        ) : (
                          <span className="text-amber-700 font-bold">بدون حساب</span>
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
                              onClick={() => setProvisionTarget(r)}
                              className="inline-flex items-center gap-1 rounded border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 px-2 py-1 text-xs font-bold"
                            >
                              <Plus className="h-3 w-3" />
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

      {provisionTarget && canWrite && (
        <ProvisionStudentAccountModal
          student={provisionTarget}
          onClose={() => setProvisionTarget(null)}
          onCreated={(res) => {
            setCredentialsSlip({
              full_name_ar: provisionTarget.full_name_ar,
              academic_number: provisionTarget.academic_number,
              email: res.email,
              password: res.password ?? "—",
            });
            setProvisionTarget(null);
            refresh();
          }}
        />
      )}

      {credentialsSlip && (
        <CredentialsSlip slip={credentialsSlip} onClose={() => setCredentialsSlip(null)} />
      )}
    </div>
  );
}

// ============= PROVISION STUDENT ACCOUNT MODAL (STUDENT-PROVISIONING-EMAIL-02T) =============
// First click on «إنشاء حساب» opens this review dialog only — nothing is sent
// to the server until the admin types a valid @students.usr.edu.ye email and
// presses the final confirmation button.

function ProvisionStudentAccountModal({
  student,
  onClose,
  onCreated,
}: {
  student: AdminStudentRow;
  onClose: () => void;
  onCreated: (res: { email: string; password?: string }) => void;
}) {
  const create = useServerFn(createAccount);
  const profileEmail = String((student as any).email ?? "").trim();
  // Prefill only when the profile email is already a valid student-domain
  // address; never prefill placeholder/foreign-domain values (e.g. a@b.comt).
  const [email, setEmail] = useState(isStudentUniversityEmail(profileEmail) ? profileEmail : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const validationError = validateStudentUniversityEmailInput(email);
  const canConfirm = !busy && validationError === null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfirm) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await create({
        data: { kind: "student", profile_id: student.id, university_email: email.trim() },
      });
      onCreated({ email: res.email, password: res.password });
    } catch (e: any) {
      // Fail closed: the server either created nothing or rolled back the Auth
      // user, so the student's linkage is unchanged. Surface a safe message.
      setErr(e?.message ?? "تعذّر إنشاء حساب الدخول — لم يتغير ارتباط الطالب");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-black text-lg">إنشاء حساب دخول للطالب</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-1 hover:bg-secondary rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">الطالب: </span><span className="font-bold">{student.full_name_ar}</span></div>
            <div><span className="text-muted-foreground">الرقم الأكاديمي: </span><span className="font-mono font-bold" dir="ltr">{student.academic_number}</span></div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold">
              الإيميل الجامعي للطالب <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              dir="ltr"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`student${STUDENT_UNIVERSITY_EMAIL_SUFFIX}`}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-left outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-[11px] text-muted-foreground">
              يجب أن ينتهي البريد بـ <span dir="ltr" className="font-mono">{STUDENT_UNIVERSITY_EMAIL_SUFFIX}</span> وألا يكون مستخدماً بحساب آخر.
            </p>
            {email.trim() !== "" && validationError && (
              <p className="text-[11px] font-bold text-destructive">{validationError}</p>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            تُنشأ كلمة مرور مؤقتة عشوائية وتُعرض لك مرة واحدة بعد الإنشاء، ويجب على الطالب تغييرها عند أول دخول.
          </p>

          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">{err}</div>
          )}
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2 bg-secondary/30">
          <button type="button" onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold">إلغاء</button>
          <button
            type="submit"
            disabled={!canConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد إنشاء الحساب
          </button>
        </div>
      </form>
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
    study_system: "",
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
        study_system: form.study_system || undefined,
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
              <Field label="الإيميل الجامعي">
                <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)}
                  dir="ltr" placeholder="student@students.usr.edu.ye"
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
              <Field label="نظام الدراسة">
                <select value={form.study_system} onChange={(e) => update("study_system", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">غير محدد</option>
                  <option value="regular">عام</option>
                  <option value="private">نفقة خاصة</option>
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
                  يتم تسجيل الدخول باستخدام الإيميل الجامعي فقط (مطلوب عند تفعيل هذا الخيار).
                  تُنشأ كلمة مرور مؤقتة عشوائية وتُعرض للمسؤول مرة واحدة، ويجب على الطالب تغييرها عند أول دخول.
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
      study_system: student.study_system ?? "",
    });
  }

  const update = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await updateFn({
        data: {
          id: studentId,
          ...form,
          study_system: form.study_system || undefined,
        },
      });
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
                    <Field label="نظام الدراسة">
                      <select value={form.study_system} onChange={(e) => update("study_system", e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="">غير محدد</option>
                        <option value="regular">عام</option>
                        <option value="private">نفقة خاصة</option>
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
        body{font-family:'Amiri','Times New Roman',serif;padding:32px;color:#111827;}
        h1{font-size:18px;margin:0 0 8px;text-align:center;}
        h2{font-size:14px;margin:0 0 24px;text-align:center;color:#4B5563;font-weight:normal;}
        .box{border:2px solid #0B3D62;border-radius:8px;padding:20px;margin-top:16px;}
        .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #D1D5DB;font-size:14px;}
        .row:last-child{border:0;}
        .k{color:#4B5563;}
        .v{font-weight:bold;font-family:'Courier New',monospace;direction:ltr;}
        .note{margin-top:16px;font-size:11px;color:#4B5563;line-height:1.7;text-align:right;}
      </style></head><body>
      <h1>كلية تكنولوجيا المعلومات وعلوم الحاسوب</h1>
      <h2>بيانات الدخول إلى البوابة الإلكترونية</h2>
      <div class="box">
        <div class="row"><span class="k">الاسم:</span><span>${slip.full_name_ar}</span></div>
        <div class="row"><span class="k">الرقم الأكاديمي:</span><span class="v">${slip.academic_number}</span></div>
        <div class="row"><span class="k">الإيميل الجامعي (اسم الدخول):</span><span class="v">${slip.email}</span></div>
        <div class="row"><span class="k">كلمة المرور المؤقتة:</span><span class="v">${slip.password}</span></div>
      </div>
      <p class="note">
        • يُرجى الدخول إلى البوابة عبر <strong>/portal-login</strong> واختيار «طالب» باستخدام الإيميل الجامعي.<br>
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
            <SlipRow label="الإيميل الجامعي (اسم الدخول)" value={slip.email} mono onCopy={() => copy(slip.email)} />
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

function BackfillStat({ label, value, tone = "neutral" }: {
  label: string;
  value: number;
  tone?: "neutral" | "ok" | "bad";
}) {
  const toneClass = tone === "ok" ? "text-emerald-700" : tone === "bad" ? "text-destructive" : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-background p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-extrabold ${toneClass}`}>{value.toLocaleString("ar-EG")}</div>
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
